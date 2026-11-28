#!/usr/bin/env node
/**
 * A stdio MCP server that forwards to a deployment's MCP endpoint, signed in
 * as one persona (brightrule#75, `--llm claude-cli`). It lets a Claude Code
 * CLI run be the MCP client while the driver keeps what it needs from the
 * trajectory: every tool call (name, arguments, full output) is appended to
 * `EVAL_PROXY_LOG` as one JSON line; write tools are refused unless
 * `EVAL_PROXY_EXECUTE_WRITES=1`; the model sees the first
 * `EVAL_PROXY_OUTPUT_LIMIT` characters of a result; after `EVAL_PROXY_MAX_CALLS`
 * calls every further call answers an error.
 *
 * Env: EVAL_PROXY_BASE, EVAL_PROXY_COOKIE, EVAL_PROXY_LOG, EVAL_PROXY_OUTPUT_LIMIT, EVAL_PROXY_MAX_CALLS.
 */
import fs from 'node:fs';
import readline from 'node:readline';

const BASE = process.env.EVAL_PROXY_BASE;
const COOKIE = process.env.EVAL_PROXY_COOKIE ?? '';
const LOG = process.env.EVAL_PROXY_LOG;
const LIMIT = Number(process.env.EVAL_PROXY_OUTPUT_LIMIT ?? 60000);
const MAX_CALLS = Number(process.env.EVAL_PROXY_MAX_CALLS ?? 40);
const WRITES = process.env.EVAL_PROXY_EXECUTE_WRITES === '1';
const WRITE_TOOLS = new Set(['create_record', 'update_record', 'delete_record', 'delete_records', 'create_upload_link', 'resume_run', 'run_action', 'save_metadata_draft', 'delete_metadata_draft']);

let upstreamId = 0;
let calls = 0;

function parseRpc(text) {
  try {
    return JSON.parse(text);
  } catch {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      try {
        const j = JSON.parse(t.slice(5).trim());
        if ('result' in j || 'error' in j) return j;
      } catch {}
    }
  }
  return undefined;
}

async function upstream(method, params) {
  const res = await fetch(`${BASE}/api/v1/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: new URL(BASE).origin, cookie: COOKIE },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++upstreamId, method, ...(params ? { params } : {}) }),
  });
  const text = await res.text();
  const j = parseRpc(text);
  if (!j) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 200)}`);
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 300)}`);
  return j.result ?? {};
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const log = (entry) => LOG && fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'brightrule-eval-proxy', version: '1' } } });
    }
    if (method === 'tools/list') {
      const r = await upstream('tools/list');
      return send({ jsonrpc: '2.0', id, result: { tools: r.tools ?? [] } });
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments ?? {};
      let output;
      if (++calls > MAX_CALLS) output = JSON.stringify({ error: `tool-call limit (${MAX_CALLS}) reached in this evaluation turn; answer now.` });
      else if (!WRITES && WRITE_TOOLS.has(name)) output = JSON.stringify({ error: `${name} is not executed in an evaluation run.` });
      else {
        try {
          const r = await upstream('tools/call', { name, arguments: args });
          const text = (r.content ?? []).map((c) => c.text ?? '').join('\n');
          output = r.isError ? JSON.stringify({ error: text }) : text;
        } catch (e) {
          output = JSON.stringify({ error: e.message });
        }
      }
      log({ toolName: name, toolCallId: `c${calls}`, input: args, output });
      const isError = output.startsWith('{"error"');
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: output.slice(0, LIMIT) }], ...(isError ? { isError: true } : {}) } });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e) {
    return send({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  void handle(msg);
});
