/**
 * The MCP route (brightrule#75): a client's own model, any OpenAI-compatible
 * chat API, answering through the deployment's MCP server (`/api/v1/mcp`) as
 * an external MCP client would. The community edition serves this route; the
 * `ask` chat route needs the enterprise edition or the cloud.
 *
 * What the model gets is what an MCP client gets: the server's `initialize`
 * instructions, its tools, and — on the `prompt` arm — the 制度问询 skill
 * fetched with `prompts/get`. There is no 提问人 block (cloud#5099 gives it to
 * the ask route's signed-in sessions only) and no record focus: a pinned
 * question names the record in the system prompt instead, as an MCP client
 * that knows the open page would.
 *
 * Nothing the model does writes to the deployment: record writes and actions
 * are answered with a refusal (`--execute-writes` lets them through).
 */
import type { ChatMessage, Turn, TurnToolCall } from './chat.js';
import type { Session } from './http.js';
import type { PersonaChat } from './ask.js';

export const SKILL_PROMPT = 'brightrule-brightrule_policy_inquiry';
const WRITE_TOOLS = new Set(['create_record', 'update_record', 'delete_record', 'delete_records', 'create_upload_link', 'resume_run', 'run_action', 'save_metadata_draft', 'delete_metadata_draft']);

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Model calls per turn before the turn is cut off. */
  maxSteps: number;
  /** Characters of one tool result the model sees. */
  toolOutputLimit: number;
}

export interface McpOptions {
  /** `prompt`: the server's instructions plus the skill; `plain`: the instructions only. */
  arm: 'prompt' | 'plain';
  executeWrites?: boolean;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/** One MCP connection, signed in as one account. */
export class McpClient {
  private id = 0;
  instructions = '';
  tools: McpTool[] = [];
  prompts: string[] = [];

  constructor(private readonly s: Session) {}

  async rpc(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.s.baseUrl}/api/v1/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: new URL(this.s.baseUrl).origin, cookie: this.s.cookie },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, ...(params ? { params } : {}) }),
    });
    const text = await res.text();
    const json = parseRpcBody(text);
    if (!json) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 200)}`);
    if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error).slice(0, 300)}`);
    return (json.result ?? {}) as Record<string, unknown>;
  }

  async connect(): Promise<void> {
    const init = await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'brightrule-eval', version: '2' } });
    this.instructions = typeof init.instructions === 'string' ? init.instructions : '';
    this.tools = ((await this.rpc('tools/list')).tools ?? []) as McpTool[];
    const prompts = await this.rpc('prompts/list').catch(() => ({ prompts: [] }));
    this.prompts = ((prompts.prompts ?? []) as { name: string }[]).map((p) => p.name);
  }

  async prompt(name: string): Promise<string> {
    const got = await this.rpc('prompts/get', { name });
    return ((got.messages ?? []) as { content?: { text?: string } }[]).map((m) => m.content?.text ?? '').join('\n');
  }

  /** A tool's result as text; an MCP `isError` answer becomes `{ error }`, which the trajectory reads as a failed call. */
  async callTool(name: string, args: unknown): Promise<string> {
    const res = await this.rpc('tools/call', { name, arguments: args ?? {} });
    const text = ((res.content ?? []) as { text?: string }[]).map((c) => c.text ?? '').join('\n');
    return res.isError ? JSON.stringify({ error: text }) : text;
  }
}

/** A JSON-RPC answer, plain or as a single SSE `data:` frame. */
export function parseRpcBody(text: string): { result?: unknown; error?: unknown } | undefined {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as { result?: unknown; error?: unknown };
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('data:')) {
      const j = tryParse(t.slice(5).trim());
      if (j && ('result' in j || 'error' in j)) return j;
    }
  }
  return undefined;
}

/** The system prompt an MCP client gives its model: the server's instructions, the skill on the prompt arm, and the pinned record when there is one. */
export function systemPrompt(instructions: string, skill: string, focus: { object: string; id: string } | undefined): string {
  const pin = focus
    ? `员工正在看一份制度，并在制度页点了「问这份制度」：对话已钉住这份制度，对象 ${focus.object}，记录 id ${focus.id}。`
    : '';
  return [instructions, skill, pin].filter(Boolean).join('\n\n');
}

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments?: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

/** One persona's chat over MCP: a connection made on first use, and the model's tool loop per turn. */
export function mcpPersonaChat(s: Session, llm: LlmConfig, o: McpOptions): PersonaChat {
  let ready: Promise<{ client: McpClient; skill: string; tools: unknown[] }> | undefined;
  const connect = () =>
    (ready ??= (async () => {
      const client = new McpClient(s);
      await client.connect();
      let skill = '';
      if (o.arm === 'prompt') {
        if (!client.prompts.includes(SKILL_PROMPT)) throw new Error(`the server does not offer the prompt ${SKILL_PROMPT} (offered: ${client.prompts.join(', ') || 'none'})`);
        skill = await client.prompt(SKILL_PROMPT);
      }
      const tools = client.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema ?? { type: 'object', properties: {} } } }));
      return { client, skill, tools };
    })());
  let conversations = 0;

  return {
    newConversation: async () => {
      await connect();
      return `mcp-${++conversations}`;
    },
    turn: async (_conversationId: string, history: ChatMessage[], context: Record<string, unknown>): Promise<Turn> => {
      const { client, skill, tools } = await connect();
      const focus = Array.isArray(context.focus) ? (context.focus[0] as { object: string; id: string } | undefined) : undefined;
      const messages: OpenAiMessage[] = [{ role: 'system', content: systemPrompt(client.instructions, skill, focus) }, ...history.map((m) => ({ role: m.role, content: m.content }))];
      const toolCalls: TurnToolCall[] = [];
      const usage = { input: 0, output: 0 };
      for (let step = 0; step < llm.maxSteps; step++) {
        const res = await fetch(`${llm.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${llm.apiKey}` },
          body: JSON.stringify({ model: llm.model, messages, tools, temperature: 0.2, max_tokens: 4096 }),
        });
        const j = (await res.json().catch(() => ({}))) as { choices?: { message: OpenAiMessage }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        if (!res.ok || !j.choices?.length) return { text: '', toolCalls, error: `model HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`, usage };
        usage.input += j.usage?.prompt_tokens ?? 0;
        usage.output += j.usage?.completion_tokens ?? 0;
        const m = j.choices[0]!.message;
        const said: OpenAiMessage = { role: 'assistant', content: m.content ?? '' };
        if (m.reasoning_content) said.reasoning_content = m.reasoning_content;
        if (m.tool_calls?.length) said.tool_calls = m.tool_calls;
        messages.push(said);
        if (!m.tool_calls?.length) return { text: m.content ?? '', toolCalls, usage };
        for (const c of m.tool_calls) {
          let args: unknown = {};
          try {
            args = JSON.parse(c.function.arguments || '{}');
          } catch {
            /* keep {} */
          }
          const name = c.function.name;
          const output =
            !o.executeWrites && WRITE_TOOLS.has(name)
              ? JSON.stringify({ error: `${name} is not executed in an evaluation run.` })
              : await client.callTool(name, args).catch((e: Error) => JSON.stringify({ error: e.message }));
          toolCalls.push({ toolName: name, toolCallId: c.id, input: args, output });
          messages.push({ role: 'tool', tool_call_id: c.id, content: output.slice(0, llm.toolOutputLimit) });
        }
      }
      return { text: '', toolCalls, error: `no answer within ${llm.maxSteps} model calls`, usage };
    },
  };
}
