#!/usr/bin/env -S npx tsx
/**
 * The ask-route driver (brightrule#69 PR-B): load the corpus into an
 * environment, then ask the questions as their persona accounts and write run
 * records for grade.ts.
 *
 *   npx tsx scripts/eval/drive.ts setup --base URL [--corpus FILE] [--concurrency 8] [--permission-set NAME] [--admin-permission-set NAME] [--skip-policies]
 *   npx tsx scripts/eval/drive.ts run   --base URL [--questions FILE] [--corpus FILE]
 *        [--only ID,ID] [--type TYPE,TYPE] [--limit N] [--reps 3] [--concurrency 4]
 *        [--route catalog|vector|hybrid] [--model ID] [--config NAME] [--app PACKAGE]
 *        [--out FILE] [--resume] [--raw DIR] [--tokens] [--grade]
 *        [--via ask|mcp] [--arm prompt|plain] [--max-steps 20] [--execute-writes]
 *
 * `--via mcp` asks through the deployment's MCP server with a model of your own
 * (any OpenAI-compatible chat API: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL), the
 * route the community edition serves. The ask route (the default) needs the
 * enterprise edition or the cloud. See driver/mcp.ts for what differs.
 *
 * Environment variables:
 *   EVAL_PERSONA_PASSWORD   the password of every persona account (setup sets it; run signs in with it)
 *   EVAL_ADMIN_EMAIL / EVAL_ADMIN_PASSWORD
 *                           an administrator of the environment: setup needs one; run uses it, when
 *                           given, to map record ids to policies and to read token counts (--tokens)
 *
 * Questions and corpus default to scripts/eval/generated/ (run build.ts first).
 * `--route` labels the run: the environment decides which route the ask agent
 * takes (catalog today; vector and hybrid once the skill and the platform's
 * search land). Records are appended as each question finishes, so a run
 * stopped half way keeps what it has, and `--resume` asks only what is missing.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askQuestion, type PersonaChat } from './driver/ask.js';
import { chatTurn, newConversation } from './driver/chat.js';
import { mcpPersonaChat, type LlmConfig } from './driver/mcp.js';
import { claudeCliPersonaChat, cliCost, type ClaudeCliConfig } from './driver/mcp-claude-cli.js';
import { listAll, pool, signIn, type Session } from './driver/http.js';
import { policyIds, setupEnvironment } from './driver/setup.js';
import { Corpus, QuestionSet, RunRecord, type Question } from './schema.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// `pnpm run eval:drive -- setup …` passes the `--` through.
const [command, ...argv] = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
const flag = (name: string, def?: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const has = (name: string) => argv.includes(name);
const list = (name: string) => flag(name)?.split(',').map((s) => s.trim()).filter(Boolean);
const log = (line: string) => process.stdout.write(`${new Date().toISOString().slice(11, 19)} ${line}\n`);

const base = flag('--base')?.replace(/\/+$/, '');
if (!base || (command !== 'setup' && command !== 'run')) {
  console.error('usage: drive.ts setup|run --base URL [options]  (see the header of scripts/eval/drive.ts)');
  process.exit(2);
}
const personaPassword = process.env.EVAL_PERSONA_PASSWORD;
if (!personaPassword) throw new Error('set EVAL_PERSONA_PASSWORD (the persona accounts\' password)');
const corpus = Corpus.parse(JSON.parse(fs.readFileSync(flag('--corpus', path.join(HERE, 'generated/corpus.json'))!, 'utf8')));
const adminCreds = process.env.EVAL_ADMIN_EMAIL && process.env.EVAL_ADMIN_PASSWORD ? { email: process.env.EVAL_ADMIN_EMAIL, password: process.env.EVAL_ADMIN_PASSWORD } : undefined;
const admin: Session | undefined = adminCreds ? await signIn(base, adminCreds.email, adminCreds.password) : undefined;
const concurrency = Number(flag('--concurrency', command === 'setup' ? '8' : '4'));

if (command === 'setup') {
  if (!admin) throw new Error('setup needs an administrator: set EVAL_ADMIN_EMAIL and EVAL_ADMIN_PASSWORD');
  const t0 = Date.now();
  const r = await setupEnvironment(corpus, { baseUrl: base, admin, password: personaPassword, concurrency, permissionSet: flag('--permission-set'), adminPermissionSet: flag('--admin-permission-set'), skipPolicies: has('--skip-policies'), log });
  log(`setup done in ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify({ ...r, warnings: r.warnings.length })}`);
  for (const w of r.warnings) log(`warning: ${w}`);
  process.exit(0);
}

// ── run ─────────────────────────────────────────────────────────────────────
const set = QuestionSet.parse(JSON.parse(fs.readFileSync(flag('--questions', path.join(HERE, 'generated/questions.json'))!, 'utf8')));
const only = list('--only');
const types = list('--type');
let questions: Question[] = set.questions.filter((q) => (!only || only.includes(q.id)) && (!types || types.includes(q.type)));
const limit = flag('--limit');
if (limit) questions = questions.slice(0, Number(limit));
if (questions.length === 0) throw new Error('no question matches --only / --type');

const reps = Number(flag('--reps', '1'));
const via = flag('--via', 'ask')!;
if (via !== 'ask' && via !== 'mcp') throw new Error(`--via is ask or mcp, not ${via}`);
const route = flag('--route', 'catalog')!;
if (!['catalog', 'vector', 'hybrid'].includes(route)) throw new Error(`--route is catalog, vector or hybrid, not ${route}`);
const arm = flag('--arm', 'prompt')!;
if (arm !== 'prompt' && arm !== 'plain') throw new Error(`--arm is prompt or plain, not ${arm}`);
let llm: LlmConfig | undefined;
const llmBackend = flag('--llm', 'openai')!;
if (llmBackend !== 'openai' && llmBackend !== 'claude-cli') throw new Error(`--llm is openai or claude-cli, not ${llmBackend}`);
const cli: ClaudeCliConfig | undefined =
  via === 'mcp' && llmBackend === 'claude-cli'
    ? { model: process.env.LLM_MODEL || 'haiku', maxCalls: Number(flag('--max-steps', '20')), toolOutputLimit: 60_000, timeoutMs: 10 * 60_000 }
    : undefined;
if (via === 'mcp' && !cli) {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) throw new Error('--via mcp needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL (any OpenAI-compatible chat API)');
  llm = { baseUrl: LLM_BASE_URL.replace(/\/+$/, ''), apiKey: LLM_API_KEY, model: LLM_MODEL, maxSteps: Number(flag('--max-steps', '20')), toolOutputLimit: 60_000 };
}
const model = cli ? `claude-cli/${cli.model}` : via === 'mcp' ? llm!.model : flag('--model');
const config = flag('--config', via === 'mcp' ? `mcp/${model}/${arm}` : `${route}/${model ?? 'env-default'}`)!;
const app = flag('--app', 'ai.objectstack.brightrule')!;
const out = path.resolve(flag('--out', path.join(HERE, 'results', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`))!);
fs.mkdirSync(path.dirname(out), { recursive: true });
const rawDir = flag('--raw');
if (rawDir) fs.mkdirSync(rawDir, { recursive: true });

const personas = new Map(corpus.personas.map((p) => [p.id, p]));
const sessions = new Map<string, Session>();
for (const pid of new Set(questions.map((q) => q.persona))) {
  const p = personas.get(pid);
  if (!p) throw new Error(`question persona ${pid} is not in the corpus`);
  sessions.set(pid, await signIn(base, p.email, personaPassword));
}
log(`signed in ${sessions.size} persona accounts`);

// Record ids → corpus keys: as the administrator, or as the union of what the personas can read.
const byId = new Map<string, string>();
const idOfKey = new Map<string, string>();
for (const s of admin ? [admin] : [...sessions.values()]) {
  const ids = await policyIds(s, corpus);
  for (const [k, v] of ids.byId) byId.set(k, v);
  for (const [k, v] of ids.idOfKey) idOfKey.set(k, v);
}
const missing = corpus.policies.filter((p) => !idOfKey.has(p.key)).length;
log(`${idOfKey.size} corpus policies found on the environment${missing ? `, ${missing} missing (run setup, or they are hidden from the accounts)` : ''}`);
// Clause ids → their policy's key: a `search_knowledge` hit names the clause
// (`brightrule_policy_clause`), and its snippet is that policy's text.
if (admin) {
  const clauses = await listAll(admin, 'brightrule_policy_clause', ['id', 'policy'], 1000).catch((e: Error) => {
    log(`reading clauses failed (${e.message}); search_knowledge hits stay unmapped`);
    return [];
  });
  for (const c of clauses) {
    const key = byId.get(String((c.policy as { id?: string } | null)?.id ?? c.policy));
    if (key) byId.set(String(c.id), key);
  }
  if (clauses.length) log(`${clauses.length} clauses mapped to their policies`);
}
const resolver = { byId, keys: new Set(corpus.policies.map((p) => p.key)) };

const done = new Set<string>();
if (has('--resume') && fs.existsSync(out)) {
  for (const line of fs.readFileSync(out, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = RunRecord.parse(JSON.parse(line));
    if (!r.error) done.add(`${r.question}#${r.rep}#${r.config}`);
  }
  log(`resuming: ${done.size} records already in ${out}`);
}

const chats = new Map<string, PersonaChat>();
const chatOf = (personaId: string): PersonaChat => {
  let c = chats.get(personaId);
  if (!c) {
    const s = sessions.get(personaId)!;
    c = cli
      ? claudeCliPersonaChat(s, cli, { arm: arm as 'prompt' | 'plain', executeWrites: has('--execute-writes') })
      : llm
      ? mcpPersonaChat(s, llm, { arm: arm as 'prompt' | 'plain', executeWrites: has('--execute-writes') })
      : { newConversation: () => newConversation(s), turn: (conversationId, messages, context) => chatTurn(s, conversationId, messages, { context, model }) };
    chats.set(personaId, c);
  }
  return c;
};
const jobs = Array.from({ length: reps }, (_, i) => questions.map((q) => ({ q, rep: i + 1 })))
  .flat()
  .filter((j) => !done.has(`${j.q.id}#${j.rep}#${config}`));
log(`asking ${jobs.length} (${questions.length} questions × ${reps} reps${done.size ? ', minus resumed' : ''}) at concurrency ${concurrency}, config ${config}`);

let finished = 0;
const t0 = Date.now();
await pool(jobs, concurrency, async ({ q, rep }) => {
  const { record, turns } = await askQuestion(q, {
    persona: personas.get(q.persona)!,
    chat: chatOf(q.persona),
    resolver,
    idOfKey,
    baseContext: { activeApp: app, packageId: app },
    config,
    rep,
  });
  fs.appendFileSync(out, `${JSON.stringify(record)}\n`);
  if (rawDir) fs.writeFileSync(path.join(rawDir, `${q.id}.${config.replace(/[^\w.-]+/g, '_')}.r${rep}.json`), `${JSON.stringify({ record, turns }, null, 1)}\n`);
  finished++;
  const reads = record.tool_calls.flatMap((t) => t.read_policies);
  log(`[${finished}/${jobs.length}] ${q.id} r${rep} ${record.error ? `ERROR ${record.error.slice(0, 120)}` : `${Math.round(record.latency_ms / 1000)} s, ${record.tool_calls.length} tools, read ${reads.join(' ') || '-'}${record.clarified ? ', asked back' : ''}`}`);
});
log(`asked in ${Math.round((Date.now() - t0) / 1000)} s → ${out}`);
if (cli) log(`claude-cli: ${cliCost.turns} turns, list-price cost $${cliCost.usd.toFixed(3)} (charged to the CLI account's plan)`);

if (has('--tokens') && via === 'mcp') log('--tokens: the MCP route records the model\'s own usage already; nothing to read');
else if (has('--tokens')) {
  if (!admin) log('--tokens needs an administrator (EVAL_ADMIN_EMAIL / EVAL_ADMIN_PASSWORD); skipped');
  else {
    const traces = await listAll(admin, 'ai_traces', ['conversation_id', 'prompt_tokens', 'completion_tokens']).catch((e: Error) => {
      log(`reading ai_traces failed (${e.message}); token counts skipped`);
      return [];
    });
    const sum = new Map<string, { input: number; output: number }>();
    for (const t of traces) {
      const c = typeof t.conversation_id === 'string' ? t.conversation_id : (t.conversation_id as { id?: string } | null)?.id;
      if (!c) continue;
      const s = sum.get(c) ?? { input: 0, output: 0 };
      s.input += Number(t.prompt_tokens ?? 0);
      s.output += Number(t.completion_tokens ?? 0);
      sum.set(c, s);
    }
    const lines = fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.trim());
    const withTokens = lines.map((l) => {
      const r = RunRecord.parse(JSON.parse(l));
      const s = r.conversation_id ? sum.get(r.conversation_id) : undefined;
      return JSON.stringify(s ? { ...r, input_tokens: s.input, output_tokens: s.output } : r);
    });
    fs.writeFileSync(out, `${withTokens.join('\n')}\n`);
    log(`token counts from ${traces.length} traces written into the records`);
  }
}

if (has('--grade')) {
  const args = [path.join(HERE, 'grade.ts'), out, '--out', out.replace(/\.jsonl$/, '.report.json'), '--md', out.replace(/\.jsonl$/, '.report.md')];
  if (flag('--questions')) args.push('--questions', flag('--questions')!);
  if (flag('--corpus')) args.push('--corpus', flag('--corpus')!);
  const g = spawnSync('npx', ['tsx', ...args], { stdio: 'inherit' });
  process.exit(g.status ?? 1);
}
