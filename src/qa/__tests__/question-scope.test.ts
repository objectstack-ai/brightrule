import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import {
  QUESTION_SCOPE_POLICY_NOT_FOUND,
  QUESTION_SCOPE_POLICY_NOT_PUBLISHED,
  QUESTION_SCOPE_PRIORITY,
  QuestionScopeHook,
} from '../question-scope.hook.js';
import { QuestionAnswerHook } from '../question-answer.hook.js';

type Row = Record<string, unknown>;

const POLICIES: Row[] = [
  { id: 'pA', status: 'published' },
  { id: 'pB', status: 'published' },
  { id: 'pD', status: 'draft' },
  { id: 'pR', status: 'revising' },
  { id: 'pX', status: 'abolished' },
];

/** Run the scope hook on a payload (and, for an update, the stored row); return the payload it leaves. */
async function save(data: Row, previous?: Row, flat = false): Promise<{ data: Row; reads: number }> {
  let reads = 0;
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: { id: string } }) => {
        reads += 1;
        return name === 'brightrule_policy' ? (POLICIES.find((p) => p.id === where.id) ?? null) : null;
      },
    }),
  };
  const ctx = { input: flat ? data : { data }, previous, api } as unknown as HookContext;
  const handler = QuestionScopeHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return { data, reads };
}

async function refusal(data: Row, previous?: Row): Promise<string | undefined> {
  try {
    await save(data, previous);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe("an inquiry's scope", () => {
  it('declares a Chinese refusal for each rule it enforces', () => {
    expect(Object.keys(QuestionScopeHook.refusals ?? {})).toEqual([
      QUESTION_SCOPE_POLICY_NOT_FOUND,
      QUESTION_SCOPE_POLICY_NOT_PUBLISHED,
    ]);
    for (const r of Object.values(QuestionScopeHook.refusals ?? {})) expect(r.message).toMatch(/[一-鿿]/);
  });

  it('runs before the answer hook, so a refused question never reaches the model', () => {
    expect(QuestionScopeHook.priority).toBe(QUESTION_SCOPE_PRIORITY);
    expect(QUESTION_SCOPE_PRIORITY).toBeLessThan(QuestionAnswerHook.priority ?? 100);
  });

  it('derives general when no policy is named, overriding a scope_kind in the payload', async () => {
    expect((await save({ question: 'q' })).data.scope_kind).toBe('general');
    expect((await save({ question: 'q', scope_kind: 'policy' })).data.scope_kind).toBe('general');
    expect((await save({ question: 'q', scope_kind: 'version' })).data.scope_kind).toBe('general');
  });

  it('derives policy when a published policy is named, as an id or as a record', async () => {
    const { data, reads } = await save({ question: 'q', scope_policy: 'pA' });
    expect(data.scope_kind).toBe('policy');
    expect(reads).toBe(1);
    expect((await save({ question: 'q', scope_policy: { id: 'pB' }, scope_kind: 'general' })).data.scope_kind).toBe('policy');
  });

  it('refuses a policy that is not published (draft, being revised or abolished)', async () => {
    for (const id of ['pD', 'pR', 'pX']) {
      expect(await refusal({ question: 'q', scope_policy: id }), id).toBe(QUESTION_SCOPE_POLICY_NOT_PUBLISHED);
    }
  });

  it('refuses a policy that does not exist or cannot be read', async () => {
    expect(await refusal({ question: 'q', scope_policy: 'nope' })).toBe(QUESTION_SCOPE_POLICY_NOT_FOUND);
  });

  it('refuses an update that points the question at a policy that is not published', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_kind: 'policy' };
    expect(await refusal({ scope_policy: 'pX' }, stored)).toBe(QUESTION_SCOPE_POLICY_NOT_PUBLISHED);
  });

  it('moves to general when the policy is cleared', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_kind: 'policy' };
    const { data, reads } = await save({ scope_policy: null }, stored);
    expect(data.scope_kind).toBe('general');
    expect(reads).toBe(0);
  });

  it('does not re-check an update that touches no scope field, even when the stored policy is no longer published', async () => {
    const stored = { id: 'q1', scope_policy: 'pX', scope_kind: 'policy' };
    const { data, reads } = await save({ needs_human: true }, stored);
    expect(data).toEqual({ needs_human: true });
    expect(reads).toBe(0);
  });

  it('re-derives a scope_kind written alone on an update, without reading the policy', async () => {
    const stored = { id: 'q1', scope_policy: 'pX', scope_kind: 'policy' };
    const { data, reads } = await save({ scope_kind: 'general' }, stored);
    expect(data.scope_kind).toBe('policy');
    expect(reads).toBe(0);
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const { data } = await save({ question: 'q', scope_policy: 'pA' }, undefined, true);
    expect(data.scope_kind).toBe('policy');
  });
});
