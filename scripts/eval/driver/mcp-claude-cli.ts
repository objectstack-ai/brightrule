/**
 * The MCP route answered by a Claude Code CLI run (`--llm claude-cli`)
 * instead of an OpenAI-compatible chat API: each turn is one `claude -p`
 * whose only tools are the deployment's MCP tools, reached through
 * `mcp-stdio-proxy.mjs` signed in as the persona. The model then runs on the
 * CLI's own account (a Claude plan) rather than an API key.
 *
 * The system prompt is the same one `mcpPersonaChat` builds (the server's
 * instructions, the skill on the prompt arm, the pinned record). A later turn
 * of the same conversation resumes the CLI session. The proxy logs every tool
 * call, which becomes the turn's trajectory; write tools are refused there.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatMessage, Turn, TurnToolCall } from './chat.js';
import type { Session } from './http.js';
import type { PersonaChat } from './ask.js';
import { McpClient, SKILL_PROMPT, systemPrompt, type McpOptions } from './mcp.js';

const PROXY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp-stdio-proxy.mjs');

export interface ClaudeCliConfig {
  /** Model alias or id passed to `claude --model` (e.g. `haiku`). */
  model: string;
  /** Tool calls per turn before the proxy answers every further call with an error. */
  maxCalls: number;
  toolOutputLimit: number;
  /** Wall-clock limit of one turn. */
  timeoutMs: number;
}

interface CliResult {
  result?: string;
  is_error?: boolean;
  session_id?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

function runCli(args: string[], env: NodeJS.ProcessEnv, cwd: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Cost of every CLI turn of this process, as the CLI reports it (list price). */
export const cliCost = { usd: 0, turns: 0 };

export function claudeCliPersonaChat(s: Session, cfg: ClaudeCliConfig, o: McpOptions): PersonaChat {
  let ready: Promise<{ instructions: string; skill: string }> | undefined;
  const connect = () =>
    (ready ??= (async () => {
      const client = new McpClient(s);
      await client.connect();
      let skill = '';
      if (o.arm === 'prompt') {
        if (!client.prompts.includes(SKILL_PROMPT)) throw new Error(`the server does not offer the prompt ${SKILL_PROMPT}`);
        skill = await client.prompt(SKILL_PROMPT);
      }
      return { instructions: client.instructions, skill };
    })());
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cli-'));
  const sessionsOf = new Map<string, string>();
  let conversations = 0;

  return {
    newConversation: async () => {
      await connect();
      return `cli-${++conversations}`;
    },
    turn: async (conversationId: string, history: ChatMessage[], context: Record<string, unknown>): Promise<Turn> => {
      const { instructions, skill } = await connect();
      const focus = Array.isArray(context.focus) ? (context.focus[0] as { object: string; id: string } | undefined) : undefined;
      const last = history[history.length - 1];
      if (!last || last.role !== 'user') return { text: '', toolCalls: [], error: 'the last message is not the user\'s' };
      const id = `${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const logFile = path.join(work, `${id}.calls.jsonl`);
      const mcpConfig = path.join(work, `${id}.mcp.json`);
      fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { brightrule: { type: 'stdio', command: process.execPath, args: [PROXY] } } }));
      const args = ['-p', last.content, '--model', cfg.model, '--output-format', 'json', '--mcp-config', mcpConfig, '--strict-mcp-config', '--tools', '', '--allowedTools', 'mcp__brightrule', '--permission-mode', 'dontAsk', '--setting-sources', '', '--disable-slash-commands'];
      const resumeId = sessionsOf.get(conversationId);
      if (resumeId) args.push('--resume', resumeId);
      else args.push('--system-prompt', systemPrompt(instructions, skill, focus));
      const env = {
        ...process.env,
        EVAL_PROXY_BASE: s.baseUrl,
        EVAL_PROXY_COOKIE: s.cookie,
        EVAL_PROXY_LOG: logFile,
        EVAL_PROXY_OUTPUT_LIMIT: String(cfg.toolOutputLimit),
        EVAL_PROXY_MAX_CALLS: String(cfg.maxCalls),
        EVAL_PROXY_EXECUTE_WRITES: o.executeWrites ? '1' : '0',
        MAX_MCP_OUTPUT_TOKENS: String(Math.ceil(cfg.toolOutputLimit)),
      };
      const r = await runCli(args, env, work, cfg.timeoutMs);
      const toolCalls: TurnToolCall[] = fs.existsSync(logFile)
        ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as TurnToolCall)
        : [];
      let j: CliResult = {};
      try {
        j = JSON.parse(r.stdout) as CliResult;
      } catch {
        return { text: '', toolCalls, error: `claude exited ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}` };
      }
      if (j.session_id) sessionsOf.set(conversationId, j.session_id);
      const u = j.usage ?? {};
      const usage = { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output: u.output_tokens ?? 0 };
      cliCost.usd += j.total_cost_usd ?? 0;
      cliCost.turns++;
      if (j.is_error || !j.result) return { text: j.result ?? '', toolCalls, error: `claude: ${(j.result ?? r.stderr).slice(0, 300) || 'no answer'}`, usage };
      return { text: j.result, toolCalls, usage };
    },
  };
}
