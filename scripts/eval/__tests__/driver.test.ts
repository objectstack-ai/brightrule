import { describe, expect, it } from 'vitest';
import { buildCorpus } from '../corpus/index.js';
import { askQuestion, type PersonaChat } from '../driver/ask.js';
import { parseUiMessageStream, type ChatMessage, type Turn } from '../driver/chat.js';
import { rowsOf } from '../driver/http.js';
import { parentsFirst, policyRow } from '../driver/setup.js';
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
