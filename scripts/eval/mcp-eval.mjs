#!/usr/bin/env node
// 制度问询 over MCP — a customer's own model (any OpenAI-compatible chat API,
// DeepSeek by default) answering the questions in questions.json through a
// running deployment's MCP server, the way an external MCP client would.
//
//   OS_URL=http://localhost:3000 OS_EMAIL=… OS_PASSWORD=… LLM_API_KEY=… \
//     node scripts/eval/mcp-eval.mjs [--arm plain|prompt] [--reps N] [--execute-actions]
//
// Arms:
//   plain   the model gets only the server's own MCP `instructions`
//   prompt  plus the 制度问询 skill, fetched with prompts/get (the server offers
//           it once every tool the skill binds is served on the connection)
//
// Writes nothing to the deployment unless --execute-actions is given: a
// run_action of the escalation action is answered locally and recorded.
// Results go to scripts/eval/results/ (git-ignored).
//
// Environment:
//   OS_URL        deployment base URL (default http://localhost:3000)
//   OS_TOKEN      bearer token for /api/v1/mcp (OAuth access token or API key), or
//   OS_EMAIL / OS_PASSWORD   sign in with a password session instead
//   LLM_API_KEY   key for the chat API
//   LLM_BASE_URL  default https://api.deepseek.com
//   LLM_MODEL     default deepseek-flash
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const ARM = flag('--arm', 'prompt');
const REPS = Number(flag('--reps', '1'));
const EXECUTE_ACTIONS = argv.includes('--execute-actions');
const OS_URL = (process.env.OS_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
const LLM_MODEL = process.env.LLM_MODEL ?? 'deepseek-flash';
const LLM_API_KEY = process.env.LLM_API_KEY;
const PROMPT_NAME = 'brightrule-brightrule_policy_inquiry';
const ESCALATION = 'brightrule_escalate_question';
if (!LLM_API_KEY) throw new Error('Set LLM_API_KEY.');

// ── MCP connection ──────────────────────────────────────────────────────────
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Origin: OS_URL };
if (process.env.OS_TOKEN) {
  headers.Authorization = `Bearer ${process.env.OS_TOKEN}`;
} else if (process.env.OS_EMAIL && process.env.OS_PASSWORD) {
  const r = await fetch(`${OS_URL}/api/v1/auth/sign-in/email`, {
    method: 'POST', headers, body: JSON.stringify({ email: process.env.OS_EMAIL, password: process.env.OS_PASSWORD }),
  });
  if (!r.ok) throw new Error(`sign-in failed: ${r.status}`);
  headers.Cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
} else {
  throw new Error('Set OS_TOKEN, or OS_EMAIL and OS_PASSWORD.');
}
let rpcId = 0;
async function rpc(method, params) {
  const r = await fetch(`${OS_URL}/api/v1/mcp`, {
    method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'brightrule-mcp-eval', version: '1' } });
const { tools } = await rpc('tools/list');
const { prompts } = await rpc('prompts/list');
let skillText = '';
if (ARM === 'prompt') {
  if (!prompts.some((p) => p.name === PROMPT_NAME)) {
    throw new Error(`The server does not offer the prompt ${PROMPT_NAME}; offered: ${prompts.map((p) => p.name).join(', ') || 'none'}.`);
  }
  const got = await rpc('prompts/get', { name: PROMPT_NAME });
  skillText = got.messages.map((m) => m.content?.text ?? '').join('\n');
}
const SYSTEM = [init.instructions, skillText].filter(Boolean).join('\n\n');
const TOOLS = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema ?? { type: 'object', properties: {} } } }));

// Dry run (the default): nothing the model does writes to the deployment.
// run_action is checked against the real action names list_actions returns,
// so a guessed name fails as it would on the server; every record write is
// refused. --execute-actions lets all calls through.
const WRITE_TOOLS = new Set(['create_record', 'update_record', 'delete_record', 'delete_records', 'create_upload_link', 'resume_run']);
const actionNames = new Set();
if (tools.some((t) => t.name === 'list_actions')) {
  const listed = await rpc('tools/call', { name: 'list_actions', arguments: {} });
  const text = (listed.content ?? []).map((c) => c.text ?? '').join('');
  try { for (const a of JSON.parse(text).actions ?? []) actionNames.add(a.name); } catch { /* leave empty */ }
}
async function callTool(name, args) {
  if (!EXECUTE_ACTIONS && name === 'run_action') {
    const action = String(args?.actionName ?? '');
    if (!actionNames.has(action)) return JSON.stringify({ error: `Action '${action}' not found (dry run checks names against list_actions).` });
    return JSON.stringify({ ok: true, dryRun: true, message: action === ESCALATION ? '已转人工，归口部门答复后会更新在「待人工答复」中。' : 'Done.' });
  }
  if (!EXECUTE_ACTIONS && WRITE_TOOLS.has(name)) {
    return JSON.stringify({ error: `${name} is not executed in a dry run.` });
  }
  const res = await rpc('tools/call', { name, arguments: args ?? {} });
  return (res.content ?? []).map((c) => c.text ?? '').join('\n');
}

// ── one question ────────────────────────────────────────────────────────────
async function ask(question) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }];
  const trace = []; let promptTokens = 0; const t0 = Date.now();
  for (let step = 0; step < 14; step++) {
    const r = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({ model: LLM_MODEL, messages, tools: TOOLS, temperature: 0.2, max_tokens: 4096 }),
    });
    const j = await r.json();
    if (!j.choices) return { error: JSON.stringify(j).slice(0, 300), trace, ms: Date.now() - t0 };
    promptTokens += j.usage?.prompt_tokens ?? 0;
    const m = j.choices[0].message;
    const msg = { role: 'assistant', content: m.content ?? '' };
    if (m.reasoning_content) msg.reasoning_content = m.reasoning_content;
    if (m.tool_calls?.length) msg.tool_calls = m.tool_calls;
    messages.push(msg);
    if (!m.tool_calls?.length) return { answer: m.content ?? '', trace, steps: step + 1, promptTokens, ms: Date.now() - t0 };
    for (const c of m.tool_calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* keep {} */ }
      const out = await callTool(c.function.name, args).catch((e) => JSON.stringify({ error: String(e) }));
      trace.push({ tool: c.function.name, args });
      messages.push({ role: 'tool', tool_call_id: c.id, content: out.slice(0, 12000) });
    }
  }
  return { answer: '', trace, steps: 14, promptTokens, ms: Date.now() - t0, note: 'step cap' };
}

// ── run ─────────────────────────────────────────────────────────────────────
const cases = JSON.parse(fs.readFileSync(path.join(HERE, 'questions.json'), 'utf8'));
const jobs = [];
for (let rep = 0; rep < REPS; rep++) for (const c of cases) jobs.push({ ...c, rep });
const results = []; let next = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const r = await ask(job.q).catch((e) => ({ error: String(e), trace: [] }));
    const a = r.answer ?? '';
    const escalated = r.trace.some((t) => t.tool === 'run_action' && t.args?.actionName === ESCALATION);
    const escalationAttempts = r.trace.filter((t) => t.tool === 'run_action').length;
    const attemptedWrites = r.trace.filter((t) => WRITE_TOOLS.has(t.tool)).map((t) => t.tool);
    const row = {
      id: job.id, rep: job.rep, ms: r.ms, steps: r.steps, promptTokens: r.promptTokens, error: r.error,
      tools: r.trace.map((t) => t.tool), basis: Boolean(job.expect),
      correct: job.expect ? job.expect.every((e) => a.replace(/[,，\s]/g, '').includes(e)) : null,
      cited: /《[^》]+》\s*V?[\d.]*\s*第[一二三四五六七八九十百]+条/.test(a),
      disclaimer: a.includes('以正式发布的制度文本为准'),
      escalated, escalationAttempts, attemptedWrites, answer: a, trace: r.trace,
    };
    results.push(row);
    console.log(`${job.id}#${job.rep} ${((r.ms ?? 0) / 1000).toFixed(1)}s ${row.tools.join('>')} correct=${row.correct} cited=${row.cited} escalated=${escalated}${r.error ? ' ERROR ' + r.error : ''}`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

const policy = results.filter((r) => r.basis);
const noBasis = results.filter((r) => !r.basis);
const count = (rows, key) => `${rows.filter((r) => r[key]).length}/${rows.length}`;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const summary = {
  arm: ARM, model: LLM_MODEL, server: init.serverInfo, tools: tools.length, prompts: prompts.map((p) => p.name),
  policyCorrect: count(policy, 'correct'), policyCited: count(policy, 'cited'), policyDisclaimer: count(policy, 'disclaimer'),
  noBasisEscalated: count(noBasis, 'escalated'), policyWronglyEscalated: count(policy, 'escalated'),
  runActionCalls: results.reduce((n, r) => n + r.escalationAttempts, 0),
  attemptedWrites: results.flatMap((r) => r.attemptedWrites),
  medianSeconds: median(results.map((r) => (r.ms ?? 0) / 1000)), medianPromptTokens: median(results.map((r) => r.promptTokens ?? 0)),
};
console.log(JSON.stringify(summary, null, 2));
const dir = path.join(HERE, 'results');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `mcp-${ARM}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 1));
console.log(`results: ${path.relative(process.cwd(), file)}`);
