import { afterEach, describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import type { IKnowledgeService } from '@objectstack/spec/contracts';
import { GUARDED_ANSWER_FIELDS, QUESTION_GUARD_PRIORITY, QuestionGuardHook } from '../question-guard.hook.js';
import { QuestionScopeHook } from '../question-scope.hook.js';
import { answerQuestion, QuestionAnswerHook } from '../question-answer.hook.js';
import { setPolicyAI, setPolicyKnowledge } from '../policy-qa-plugin.js';
import { policyQaHooks } from '../index.js';

type Row = Record<string, unknown>;

/** A payload that sets every answer-class field, as a forger would. */
const forged = (): Row => ({
  question: '出差住宿标准是多少？',
  scope_policy: 'pA',
  needs_human: false,
  answer: '可以报销五星级酒店。',
  answer_redacted: '可以。',
  basis: [{ policy: 'pA', version: 'vA3', article: '第五条', quote: '伪造' }],
  basis_md: '《伪造办法》第一条',
  answer_route: 'whole',
  run_info: { model: 'forged' },
  answer_source: 'human',
  match_score: 0.99,
  status: 'answered',
  cited_clause: 'c1',
  other_references: '伪造',
});

async function guard(data: Row, ctx: Row = {}, flat = false): Promise<Row> {
  const handler = QuestionGuardHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler({ input: flat ? data : { data }, ...ctx } as unknown as HookContext);
  return data;
}

const PERSON = { session: { userId: 'u1' } };

describe('the answer guard', () => {
  afterEach(() => {
    setPolicyKnowledge(undefined);
    setPolicyAI(undefined);
  });

  it('guards exactly the answer-class fields the issue lists', () => {
    expect([...GUARDED_ANSWER_FIELDS].sort()).toEqual(
      [
        'answer',
        'answer_redacted',
        'basis',
        'basis_md',
        'answer_route',
        'run_info',
        'answer_source',
        'match_score',
        'status',
        'cited_clause',
        'other_references',
      ].sort(),
    );
  });

  it("strips every answer-class field from a person's insert, and keeps the question and scope", async () => {
    const d = await guard(forged(), PERSON);
    for (const field of GUARDED_ANSWER_FIELDS) expect(field in d, field).toBe(false);
    expect(d).toEqual({ question: '出差住宿标准是多少？', scope_policy: 'pA', needs_human: false });
  });

  it("strips them from a person's update as well", async () => {
    const d = await guard({ answer: '改过的答复', status: 'closed', question: '改过的问题' }, {
      ...PERSON,
      previous: { id: 'q1', answer: 'AI 的答复', status: 'answered' },
    });
    expect(d).toEqual({ question: '改过的问题' });
  });

  it('strips them from a write with no identity, and from an external AI client over MCP', async () => {
    expect('answer' in (await guard(forged()))).toBe(false);
    const viaMcp = await guard(forged(), { ...PERSON, provenance: { performedByClientId: 'claude-desktop' } });
    expect('answer' in viaMcp).toBe(false);
  });

  it('lets a system write through untouched', async () => {
    const d = await guard(forged(), { session: { isSystem: true } });
    expect(d).toEqual(forged());
  });

  it('lets a write the in-product AI performed for the person through untouched', async () => {
    const d = await guard(forged(), {
      ...PERSON,
      provenance: { performedByAgentId: 'ask', performedByConversationId: 'conv-1' },
    });
    expect(d).toEqual(forged());
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const d = await guard(forged(), PERSON, true);
    expect('answer' in d).toBe(false);
    expect(d.question).toBe('出差住宿标准是多少？');
  });

  it('runs before the scope hook and the answer hook', () => {
    expect(QuestionGuardHook.priority).toBe(QUESTION_GUARD_PRIORITY);
    expect(QUESTION_GUARD_PRIORITY).toBeLessThan(QuestionScopeHook.priority ?? 100);
    // The answer hook declares no priority: the engine runs it at 100.
    expect(QuestionAnswerHook.priority ?? 100).toBe(100);
    expect(QUESTION_GUARD_PRIORITY).toBeLessThan(100);
  });

  it('in engine order, a forged answer is stripped and the answer hook answers the question', async () => {
    // The engine's order: the question's beforeInsert hooks by ascending priority.
    const chain = policyQaHooks
      .filter((h) => h.object === 'brightrule_question' && h.events.includes('beforeInsert'))
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    expect(chain.map((h) => h.name)).toEqual([
      'brightrule_question_answer_guard',
      'brightrule_question_scope',
      'brightrule_question_answer',
    ]);

    // Retrieval finds one clause the asker may read; no model is mounted.
    setPolicyKnowledge({
      search: async () => [{ sourceRecordId: 'c1', score: 0.9 }],
    } as unknown as IKnowledgeService);
    const api = {
      object: () => ({
        find: async () => [{ id: 'c1', title: '住宿标准', citation: '《差旅费报销管理办法》V3.0 第五条', content: '每晚 600 元。' }],
        findOne: async () => null,
      }),
    };
    const data = forged();
    delete data.scope_policy;
    const ctx = { input: { data }, api, ...PERSON } as unknown as HookContext;
    for (const hook of chain) {
      const run = typeof hook.handler === 'function' ? hook.handler : answerQuestion;
      await (run as (c: HookContext) => Promise<void>)(ctx);
    }
    expect(data.answer).not.toBe('可以报销五星级酒店。');
    expect(String(data.answer)).toContain('《差旅费报销管理办法》V3.0 第五条');
    expect(data.answer_source).toBe('ai');
    expect(data.status).toBe('open');
    expect(data.scope_kind).toBe('general');
  });
});
