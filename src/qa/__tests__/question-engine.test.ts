import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';
import { Question } from '../../objects';
import { NOT_FOUND_ANSWER, REFERENCE_INTRO } from '../answer.js';

type Row = Record<string, unknown>;

// The question hooks on the REAL engine (booted from source, in-memory
// database): the guard, the scope hook and the answer hook run in the order
// the engine gives them, with the context it builds for each kind of writer.
describe('inquiry hooks on the engine', () => {
  let stack: VerifyStack;
  let asker: string;
  let member: string;
  let published: Row;

  beforeAll(async () => {
    stack = await bootStack(config);
    // A person asking. The dev admin is a person like any other to the guard
    // (only system and in-product AI writes pass); a plain member holds the
    // default 问询人 set (brightrule#48) and sees only their own questions.
    asker = await stack.signIn();
    member = await stack.signUp('member@example.com');
    const policies = (await stack.rows('brightrule_policy', {})) as Row[];
    published = policies.find((p) => p.status === 'published')!;
  });

  afterAll(async () => {
    await stack?.stop();
  });

  const refId = (v: unknown) => (v && typeof v === 'object' ? (v as Row).id : v);

  it('strips a forged answer from a person, and the answer hook still answers', async () => {
    const row = (await stack.hooks.run(
      Question.name,
      'insert',
      {
        question: '出差住宿标准是多少？',
        answer: '可以报销五星级酒店。',
        answer_source: 'human',
        status: 'answered',
        match_score: 0.99,
        basis_md: '《伪造办法》第一条',
        run_info: { model: 'forged' },
      },
      { as: asker },
    )) as Row;
    expect(row.answer).not.toBe('可以报销五星级酒店。');
    // Without a model in the test boot, the answer hook lists the retrieved
    // clauses (or says none matched) and hands the question to a person.
    expect(String(row.answer).startsWith(REFERENCE_INTRO) || row.answer === NOT_FOUND_ANSWER).toBe(true);
    expect(row.answer_source).toBe('ai');
    expect(row.status).toBe('open');
    expect(row.basis_md ?? null).toBeNull();
    expect(row.run_info ?? null).toBeNull();
    expect(row.scope_kind).toBe('general');
  });

  it("strips a person's update of the answer fields, and keeps the rest of the update", async () => {
    const row = (await stack.hooks.run(Question.name, 'insert', { question: '年假怎么计算？' }, { as: asker })) as Row;
    const updated = (await stack.hooks.run(
      Question.name,
      'update',
      { id: row.id, question: '年假天数怎么计算？', answer: '每年 30 天。', status: 'answered' },
      { as: asker },
    )) as Row;
    const [stored] = (await stack.rows(Question.name, { id: row.id })) as Row[];
    expect(stored.question).toBe('年假天数怎么计算？');
    expect(stored.answer).toBe(row.answer);
    expect(stored.status).toBe(row.status);
    expect(updated).toBeTruthy();
  });

  it('keeps the answer of a system write (the answer hook leaves it as written)', async () => {
    const row = (await stack.hooks.run(
      Question.name,
      'insert',
      { question: '系统导入的问询', answer: '人工答复：按第五条执行。', answer_source: 'human', status: 'answered' },
      { system: true },
    )) as Row;
    expect(row.answer).toBe('人工答复：按第五条执行。');
    expect(row.answer_source).toBe('human');
    expect(row.status).toBe('answered');
  });

  it('keeps the answer of a write the in-product AI performed for the person', async () => {
    const context = {
      ...(await stack.contextFor(asker)),
      performedBy: { agentId: 'ask', conversationId: 'conv-test' },
    };
    const ql = stack.kernel.getService<{
      insert(object: string, data: Row, opts: { context: unknown }): Promise<Row>;
    }>('objectql');
    const row = await ql.insert(
      Question.name,
      {
        question: '对话里问的问题',
        answer_redacted: '可以，标准为每晚 600 元（见 A 公司差旅办法第五条）。',
        answer: '可以，标准为每晚 600 元。',
        answer_source: 'ai',
        answer_route: 'whole',
        status: 'answered',
        basis: [{ policy: 'p', article: '第五条', quote: '每晚 600 元' }],
        run_info: { conversation_id: 'conv-test' },
      },
      { context },
    );
    expect(row.answer).toBe('可以，标准为每晚 600 元。');
    expect(row.answer_route).toBe('whole');
    expect(row.status).toBe('answered');
    expect(row.basis).toEqual([{ policy: 'p', article: '第五条', quote: '每晚 600 元' }]);
  });

  it('keeps the escalate action working: its write is a system write, owned by the asker', async () => {
    const out = (await stack.actions.run(Question.name, 'brightrule_escalate_question', {
      as: member,
      params: { question: '能否报销私车公用的油费？', context: '查过差旅办法' },
    })) as Row;
    const payload = ((out as Row).data ?? out) as Row;
    const id = (payload.result as Row | undefined)?.questionId ?? payload.questionId;
    expect(id).toBeTruthy();
    const [stored] = (await stack.rows(Question.name, { id })) as Row[];
    expect(String(stored.answer)).toContain('已转归口部门人工答复');
    expect(stored.needs_human).toBe(true);
    // The body runs as system, yet the row is owned by the person who asked,
    // so a private question stays theirs to read.
    expect(stored.owner_id).toBe((await stack.contextFor(member)).userId);
  });

  it('derives scope_kind from a published policy, overriding the payload', async () => {
    const byPolicy = (await stack.hooks.run(
      Question.name,
      'insert',
      { question: '这份制度谁负责解释？', scope_policy: published.id, scope_kind: 'general' },
      { as: asker },
    )) as Row;
    expect(refId(byPolicy.scope_policy)).toBe(published.id);
    expect(byPolicy.scope_kind).toBe('policy');
  });

  it('refuses a policy that is not published', async () => {
    const draft = (await stack.hooks.run(
      'brightrule_policy',
      'insert',
      { title: '尚未发布的示例制度', status: 'draft' },
      { as: asker },
    )) as Row;
    await expect(
      stack.hooks.run(Question.name, 'insert', { question: '草稿怎么规定？', scope_policy: draft.id }, { as: asker }),
    ).rejects.toMatchObject({ code: 'QUESTION_SCOPE_POLICY_NOT_PUBLISHED' });
  });
});
