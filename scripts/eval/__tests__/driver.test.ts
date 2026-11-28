import { describe, expect, it, vi } from 'vitest';
import { buildCorpus } from '../corpus/index.js';
import { askQuestion, type PersonaChat } from '../driver/ask.js';
import { parseUiMessageStream, type ChatMessage, type Turn } from '../driver/chat.js';
import { rowsOf } from '../driver/http.js';
import { mcpPersonaChat, parseRpcBody, SKILL_PROMPT, systemPrompt } from '../driver/mcp.js';
import { grantSelf, parentsFirst, policyRow, setupEnvironment } from '../driver/setup.js';
import { policyKeysIn, retrievalFrom, toToolCalls, unwrapOutput } from '../driver/trajectory.js';
import { buildQuestionSet } from '../questions/index.js';
import { RunRecord } from '../schema.js';

const corpus = buildCorpus({ distractors: 0 });
const questions = new Map(buildQuestionSet().questions.map((q) => [q.id, q]));
const Q = (id: string) => questions.get(id)!;
const persona = (id: string) => corpus.personas.find((p) => p.id === id)!;

// Record ids on a pretend environment: `id-<key>`.
const idOfKey = new Map(corpus.policies.map((p) => [p.key, `id-${p.key}`]));
const resolver = { byId: new Map([...idOfKey].map(([k, id]) => [id, k])), keys: new Set(idOfKey.keys()) };

const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe('the chat stream', () => {
  it('reads text deltas, tool calls with their outputs, and errors', () => {
    const body = [
      frame({ type: 'start' }),
      frame({ type: 'tool-input-available', toolCallId: 't1', toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-FIN-001' } }),
      frame({ type: 'tool-output-available', toolCallId: 't1', output: { id: 'id-FIN-001', title: '差旅费报销管理办法' } }),
      frame({ type: 'text-delta', id: 'x', delta: '每晚不超过 ' }),
      'data: not json\n',
      frame({ type: 'text-delta', id: 'x', delta: '600 元。' }),
      frame({ type: 'finish' }),
      'data: [DONE]\n',
    ].join('');
    const t = parseUiMessageStream(body);
    expect(t.text).toBe('每晚不超过 600 元。');
    expect(t.toolCalls).toHaveLength(1);
    expect(t.toolCalls[0]!.output).toEqual({ id: 'id-FIN-001', title: '差旅费报销管理办法' });
    expect(t.error).toBeUndefined();
    expect(parseUiMessageStream(frame({ type: 'error', errorText: 'boom' })).error).toBe('boom');
  });

  it('reads list answers in any of the data API envelopes', () => {
    expect(rowsOf({ data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(rowsOf({ records: [{ id: 'b' }], total: 1 })).toEqual([{ id: 'b' }]);
    expect(rowsOf({ data: { records: [{ id: 'c' }] } })).toEqual([{ id: 'c' }]);
    expect(() => rowsOf({ ok: true })).toThrow();
  });
});

describe('the trajectory', () => {
  it('maps get_record reads and catalog rows to corpus keys, and skips failed calls', () => {
    const calls = toToolCalls([
      { toolName: 'query_records', input: { objectName: 'brightrule_policy' }, output: { records: [{ id: 'id-A-FIN-010' }, { id: 'id-FIN-001' }, { id: 'unknown' }] } },
      { toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-FIN-001' }, output: { id: 'id-FIN-001' } },
      { toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-A-FIN-010' }, output: { error: 'not found' } },
      { toolName: 'get_record', input: { objectName: 'sys_business_unit', recordId: 'u1' }, output: { id: 'u1' } },
      { toolName: 'get_record_context', input: {}, output: { record: { id: 'id-HR-002', policy_no: 'HR-002' } } },
    ], resolver);
    expect(calls.map((c) => c.listed_policies)).toEqual([['A-FIN-010', 'FIN-001'], [], [], [], []]);
    expect(calls.map((c) => c.read_policies)).toEqual([[], ['FIN-001'], [], [], ['HR-002']]);
  });

  it('unwraps the stream\'s text wrapper, reads rows returned with their body, and treats an { error } answer as failed', () => {
    const text = (v: unknown) => ({ type: 'text', value: JSON.stringify(v) });
    const calls = toToolCalls([
      { toolName: 'query_records', input: { objectName: 'brightrule_policy' }, output: text({ count: 2, records: [{ id: 'id-A-FIN-010', body_md: '# 差旅…' }, { id: 'id-FIN-001' }] }) },
      { toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-FIN-001' }, output: text({ error: '`related`: not a lookup field', objectName: 'brightrule_policy' }) },
      { toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-FIN-001' }, output: text({ id: 'id-FIN-001', body_md: '…' }) },
    ], resolver);
    expect(calls.map((c) => c.listed_policies)).toEqual([['A-FIN-010', 'FIN-001'], [], []]);
    expect(calls.map((c) => c.read_policies)).toEqual([['A-FIN-010'], [], ['FIN-001']]);
    expect(unwrapOutput({ type: 'json', value: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapOutput('not json')).toBe('not json');
  });

  it('reads the policies whose clauses a search_knowledge call returned, through the clause → policy map', () => {
    const withClauses = { ...resolver, byId: new Map([...resolver.byId, ['clause-1', 'FIN-001'], ['clause-2', 'HR-002']]) };
    const hits = { hits: [{ snippet: '…', record: { object: 'brightrule_policy_clause', id: 'clause-2' } }, { record: { object: 'brightrule_policy_clause', id: 'clause-1' } }, { record: { object: 'brightrule_policy_clause', id: 'clause-x' } }] };
    const calls = toToolCalls([{ toolName: 'search_knowledge', input: { query: '差旅' }, output: JSON.stringify(hits) }], withClauses);
    expect(calls[0]!.read_policies).toEqual(['HR-002', 'FIN-001']);
    expect(calls[0]!.listed_policies).toEqual(['HR-002', 'FIN-001']);
  });

  it('finds policies by policy_no as well as by id', () => {
    expect(policyKeysIn([{ policy_no: 'FIN-001' }, { nested: { id: 'id-HR-002' } }, { policy_no: 'NOPE' }], resolver)).toEqual(['FIN-001', 'HR-002']);
  });

  it('reads retrieval hits of search_knowledge calls, with the article a chunk names', () => {
    const hits = retrievalFrom([
      { toolName: 'search_knowledge', input: { query: '住宿' }, output: { results: [{ recordId: 'x', record: { id: 'id-FIN-001' }, content: '**第五条** 一线城市…' }, { content: 'no policy' }] } },
    ], resolver);
    expect(hits).toEqual([{ policy: 'FIN-001', article: '第五条' }]);
    expect(retrievalFrom([{ toolName: 'get_record', input: {} }], resolver)).toBeUndefined();
  });
});

/** A scripted persona chat: answers in order, and remembers what it was sent. */
function scripted(answers: Turn[]) {
  const sent: { messages: ChatMessage[]; context: Record<string, unknown> }[] = [];
  const chat: PersonaChat = {
    newConversation: async () => 'conv-1',
    turn: async (_c, messages, context) => {
      sent.push({ messages: messages.map((m) => ({ ...m })), context });
      const a = answers.shift();
      if (!a) throw new Error('no more scripted answers');
      return a;
    },
  };
  return { chat, sent };
}

const setup = (personaId: string, chat: PersonaChat) => ({ persona: persona(personaId), chat, resolver, idOfKey, baseContext: { activeApp: 'app' }, config: 'test', rep: 1 });

describe('asking one question', () => {
  it('answers one clarifying question with the scripted reply and grades the second answer', async () => {
    const q = Q('zh-clarify-01');
    const { chat, sent } = scripted([
      { text: '集团规定一线城市每晚 600 元，甲公司 500 元。请问您在哪家公司？', toolCalls: [] },
      { text: '乙公司按集团规定，每晚不超过 600 元。', toolCalls: [{ toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-FIN-001' }, output: { id: 'id-FIN-001' } }] },
    ]);
    const { record } = await askQuestion(q, setup(q.persona, chat));
    expect(RunRecord.parse(record)).toBeTruthy();
    expect(record.clarified).toBe(true);
    expect(record.clarify_text).toContain('哪家公司');
    expect(record.answer).toContain('600');
    expect(record.tool_calls[0]!.read_policies).toEqual(['FIN-001']);
    expect(record.conversation_id).toBe('conv-1');
    expect(sent[1]!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent[1]!.messages[2]!.content).toBe(q.clarify_reply);
  });

  it('does not answer a second clarifying question', async () => {
    const q = Q('zh-clarify-01');
    const { chat, sent } = scripted([
      { text: '请问您在哪家公司？', toolCalls: [] },
      { text: '请问您是什么职级？', toolCalls: [] },
    ]);
    const { record } = await askQuestion(q, setup(q.persona, chat));
    expect(sent).toHaveLength(2);
    expect(record.answer).toBe('请问您是什么职级？');
  });

  it('sends earlier turns first and leaves their tool calls out of the record', async () => {
    const q = Q('zh-unit-34');
    const { chat, sent } = scripted([
      { text: '乙公司私车公用每公里 1.0 元。', toolCalls: [{ toolName: 'get_record', input: { objectName: 'brightrule_policy', recordId: 'id-B-ADM-002' }, output: {} }] },
      { text: '婚假 15 天。', toolCalls: [] },
    ]);
    const { record } = await askQuestion(q, setup(q.persona, chat));
    expect(sent[0]!.messages).toEqual([{ role: 'user', content: q.context_turns[0] }]);
    expect(sent[1]!.messages).toHaveLength(3);
    expect(record.tool_calls).toEqual([]);
    expect(record.clarified).toBe(false);
  });

  it('pins the conversation to the record of a pinned question', async () => {
    const q = Q('zh-pinned-01');
    const { chat, sent } = scripted([{ text: '本办法规定了住宿、伙食和交通。', toolCalls: [] }]);
    await askQuestion(q, setup(q.persona, chat));
    expect(sent[0]!.context).toEqual({ activeApp: 'app', focus: [{ object: 'brightrule_policy', id: `id-${q.pinned_policy}` }] });
  });

  it('records a failure instead of throwing', async () => {
    const q = Q('zh-direct-01');
    const { record } = await askQuestion(q, setup(q.persona, scripted([{ text: '', toolCalls: [], error: 'model unavailable' }]).chat));
    expect(record.error).toBe('model unavailable');
    expect(record.answer).toBe('');
  });
});

describe('loading the corpus', () => {
  it('writes a policy with its key as policy_no and leaves 试行 and 大类 to the app', () => {
    const p = corpus.policies.find((x) => x.key === 'C-HR-002')!;
    const row = policyRow(p, 'unit-1');
    expect(row).toMatchObject({ title: p.title, policy_no: 'C-HR-002', owning_unit: 'unit-1', status: p.status, body_md: p.body_md });
    expect(row.text_chars).toBeGreaterThan(0);
    expect(row).not.toHaveProperty('is_trial');
    expect(row).not.toHaveProperty('category_group');
  });

  it('orders units parents first', () => {
    const shuffled = [...corpus.units].reverse();
    const order = parentsFirst(shuffled).map((u) => u.code);
    for (const u of corpus.units) if (u.parent) expect(order.indexOf(u.parent)).toBeLessThan(order.indexOf(u.code));
    expect(() => parentsFirst([{ code: 'X', name: 'x', parent: 'Y', kind: 'company', distractor: false }])).toThrow(/not in the corpus/);
  });
});

// ── the MCP route (brightrule#75) ───────────────────────────────────────────

describe('the MCP route', () => {
  it('reads a JSON-RPC answer plain or as an SSE frame', () => {
    expect(parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')).toMatchObject({ result: { ok: true } });
    expect(parseRpcBody('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n')).toMatchObject({ result: { tools: [] } });
    expect(parseRpcBody('<html>')).toBeUndefined();
  });

  it('names the pinned record in the system prompt, since MCP has no focus', () => {
    expect(systemPrompt('server', 'skill', undefined)).toBe('server\n\nskill');
    expect(systemPrompt('server', '', { object: 'brightrule_policy', id: 'id-FIN-001' })).toContain('记录 id id-FIN-001');
  });

  /** A fake deployment (MCP JSON-RPC) and a fake OpenAI-compatible model, scripted per call. */
  function fakeNetwork(modelReplies: unknown[]) {
    const mcpCalls: { method: string; params: unknown }[] = [];
    const modelBodies: { messages: { role: string; content: string | null }[]; tools: unknown[] }[] = [];
    const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('/api/v1/mcp')) {
        mcpCalls.push({ method: body.method, params: body.params });
        const result =
          body.method === 'initialize' ? { instructions: 'SERVER-INSTRUCTIONS' }
          : body.method === 'tools/list' ? { tools: [{ name: 'get_record', inputSchema: { type: 'object' } }, { name: 'update_record' }] }
          : body.method === 'prompts/list' ? { prompts: [{ name: SKILL_PROMPT }] }
          : body.method === 'prompts/get' ? { messages: [{ content: { text: 'SKILL-TEXT' } }] }
          : body.params.name === 'get_record' && body.params.arguments.recordId === 'missing'
            ? { isError: true, content: [{ text: 'not found' }] }
            : { content: [{ text: JSON.stringify({ id: body.params.arguments.recordId, body_md: '…' }) }] };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
      }
      modelBodies.push(body);
      const reply = modelReplies.shift();
      return new Response(JSON.stringify(reply));
    });
    vi.stubGlobal('fetch', fetchMock);
    return { mcpCalls, modelBodies };
  }
  const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const say = (content: string | null, tool_calls?: unknown[], tokens = [100, 10]) => ({ choices: [{ message: { role: 'assistant', content, tool_calls } }], usage: { prompt_tokens: tokens[0], completion_tokens: tokens[1] } });
  const llm = { baseUrl: 'https://llm.test/v1', apiKey: 'k', model: 'm', maxSteps: 5, toolOutputLimit: 1000 };
  const session = { baseUrl: 'http://env.test', cookie: 'c=1' };

  it('runs the tool loop: skill in the system prompt, reads mapped, writes refused, errors failed, usage summed', async () => {
    const net = fakeNetwork([
      say(null, [call('a', 'get_record', { objectName: 'brightrule_policy', recordId: 'id-FIN-001' }), call('b', 'update_record', { objectName: 'brightrule_policy' }), call('c', 'get_record', { objectName: 'brightrule_policy', recordId: 'missing' })]),
      say('每晚不超过 600 元。', undefined, [200, 20]),
    ]);
    try {
      const q = Q('zh-direct-01');
      const chat = mcpPersonaChat(session, llm, { arm: 'prompt' });
      const { record } = await askQuestion(q, setup(q.persona, chat));
      expect(net.modelBodies[0]!.messages[0]!.content).toBe('SERVER-INSTRUCTIONS\n\nSKILL-TEXT');
      expect(net.mcpCalls.filter((c) => c.method === 'tools/call').map((c) => (c.params as { name: string }).name)).toEqual(['get_record', 'get_record']);
      expect(record.answer).toBe('每晚不超过 600 元。');
      expect(record.tool_calls.map((t) => t.read_policies)).toEqual([['FIN-001'], [], []]);
      expect(record.input_tokens).toBe(300);
      expect(record.output_tokens).toBe(30);
      expect(RunRecord.parse(record)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('answers one clarifying question over MCP, and only one', async () => {
    const net = fakeNetwork([say('请问您在哪家公司？'), say('请问您是什么职级？')]);
    try {
      const q = Q('zh-clarify-01');
      const { record } = await askQuestion(q, setup(q.persona, mcpPersonaChat(session, llm, { arm: 'plain' })));
      expect(net.modelBodies).toHaveLength(2);
      expect(net.modelBodies[1]!.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(net.modelBodies[1]!.messages[3]!.content).toBe(q.clarify_reply);
      expect(net.mcpCalls.some((c) => c.method === 'prompts/get')).toBe(false);
      expect(record.clarified).toBe(true);
      expect(record.answer).toBe('请问您是什么职级？');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('records a turn cut off at the step cap as an error', async () => {
    fakeNetwork([say(null, [call('a', 'get_record', { objectName: 'brightrule_policy', recordId: 'id-FIN-001' })]), say(null, [call('b', 'get_record', { objectName: 'brightrule_policy', recordId: 'id-FIN-001' })])]);
    try {
      const q = Q('zh-direct-01');
      const { record } = await askQuestion(q, setup(q.persona, mcpPersonaChat(session, { ...llm, maxSteps: 2 }, { arm: 'plain' })));
      expect(record.error).toMatch(/within 2 model calls/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ── setup against a published-only environment (brightrule#70) ──────────────

describe('setup on an environment where only the policy administrator reads unpublished policies', () => {
  /**
   * A small fake of the data API and auth: tables in memory, and the #70 rule
   * — a list of brightrule_policy shows drafts and abolished rows only to an
   * account holding brightrule_policy_admin.
   */
  function fakeEnvironment() {
    const tables: Record<string, Record<string, unknown>[]> = {
      sys_business_unit: [], sys_user: [{ id: 'admin-1', email: 'admin@example.test' }], sys_business_unit_member: [],
      sys_user_permission_set: [], brightrule_policy: [], brightrule_policy_attachment: [],
    };
    let n = 0;
    const log: string[] = [];
    const adminSees = () => tables.sys_user_permission_set!.some((g) => g.user_id === 'admin-1' && g.permission_set === 'brightrule_policy_admin');
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'set-cookie': 's=1; Path=/' } });
    const fetchMock = vi.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
      const u = new URL(url);
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      const p = u.pathname;
      if (p === '/api/v1/auth/get-session') return json({ user: { id: 'admin-1' } });
      if (p === '/api/v1/auth/sign-in/email' || p === '/api/v1/auth/change-password') return json({ ok: true });
      if (p === '/api/v1/auth/admin/create-user') {
        const id = `u${++n}`;
        tables.sys_user!.push({ id, email: body.email });
        return json({ user: { id } });
      }
      if (p.startsWith('/api/v1/actions/')) return json({ ok: true });
      const m = p.match(/^\/api\/v1\/data\/([a-z_]+)(?:\/([^/]+))?$/);
      if (!m) return json({ error: `no route ${p}` }, 404);
      const [, object, id] = m;
      const rows = tables[object!]!;
      log.push(`${method} ${object}`);
      if (method === 'GET') {
        let visible = rows;
        if (object === 'brightrule_policy' && !adminSees()) visible = rows.filter((r) => r.status === 'published');
        const skip = Number(u.searchParams.get('skip') ?? 0);
        const limit = Number(u.searchParams.get('limit') ?? 200);
        return json({ records: visible.slice(skip, skip + limit) });
      }
      if (method === 'POST') {
        const row = { id: `r${++n}`, ...body };
        rows.push(row);
        return json({ id: row.id, record: row });
      }
      const row = rows.find((r) => r.id === id);
      if (!row) return json({ error: 'not found' }, 404);
      if (object === 'brightrule_policy' && row.status !== 'published' && !adminSees()) return json({ error: 'not found' }, 404);
      if (method === 'PATCH') Object.assign(row, body);
      if (method === 'DELETE') rows.splice(rows.indexOf(row), 1);
      return json({ id });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { tables, log };
  }

  const small = {
    ...corpus,
    units: corpus.units.filter((u) => u.code === 'DEMO-GROUP' || u.code === 'DEMO-A'),
    personas: corpus.personas.filter((p) => p.id === 'p-a-staff'),
    policies: corpus.policies.filter((p) => ['FIN-001', 'FIN-001-2023', 'A-FIN-010'].includes(p.key)),
  };
  const opts = (log: string[] = []) => ({ baseUrl: 'http://env.test', admin: { baseUrl: 'http://env.test', cookie: 's=1' }, password: 'pw', concurrency: 2, log: (l: string) => log.push(l) });

  it('grants the administrator brightrule_policy_admin before reading any policy, so a rerun finds the abolished one and creates nothing', async () => {
    const env = fakeEnvironment();
    try {
      expect(small.policies.some((p) => p.status !== 'published')).toBe(true);
      const first = await setupEnvironment(small, opts());
      expect(first.policies).toEqual({ created: 3, updated: 0 });
      const grantAt = env.log.indexOf('POST sys_user_permission_set');
      expect(grantAt).toBeGreaterThanOrEqual(0);
      expect(grantAt).toBeLessThan(env.log.indexOf('GET brightrule_policy'));
      expect(env.tables.sys_user_permission_set!.filter((g) => g.user_id === 'admin-1')).toEqual([expect.objectContaining({ permission_set: 'brightrule_policy_admin' })]);

      const second = await setupEnvironment(small, opts());
      expect(second.policies).toEqual({ created: 0, updated: 3 });
      expect(env.tables.brightrule_policy).toHaveLength(3);
      expect(env.tables.sys_user_permission_set!.filter((g) => g.user_id === 'admin-1')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('grantSelf writes nothing when the account already holds the set', async () => {
    const env = fakeEnvironment();
    try {
      expect(await grantSelf({ baseUrl: 'http://env.test', cookie: 's=1' }, 'brightrule_policy_admin')).toBe(true);
      expect(await grantSelf({ baseUrl: 'http://env.test', cookie: 's=1' }, 'brightrule_policy_admin')).toBe(false);
      expect(env.tables.sys_user_permission_set).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
