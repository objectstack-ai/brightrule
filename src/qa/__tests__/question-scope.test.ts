import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import {
  QUESTION_SCOPE_POLICY_MISMATCH,
  QUESTION_SCOPE_PRIORITY,
  QUESTION_SCOPE_VERSION_NOT_CURRENT,
  QUESTION_SCOPE_VERSION_NOT_FOUND,
  QuestionScopeHook,
} from '../question-scope.hook.js';
import { QuestionAnswerHook } from '../question-answer.hook.js';

type Row = Record<string, unknown>;

const VERSIONS: Row[] = [
  { id: 'vA3', policy: 'pA', version_status: 'current' },
  { id: 'vA2', policy: 'pA', version_status: 'superseded' },
  { id: 'vA4', policy: 'pA', version_status: 'draft' },
  { id: 'vB1', policy: { id: 'pB' }, version_status: 'current' },
];

/** Run the scope hook on a payload (and, for an update, the stored row); return the payload it leaves. */
async function save(data: Row, previous?: Row, flat = false): Promise<{ data: Row; reads: number }> {
  let reads = 0;
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: { id: string } }) => {
        reads += 1;
        return name === 'brightrule_policy_version' ? (VERSIONS.find((v) => v.id === where.id) ?? null) : null;
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
      QUESTION_SCOPE_POLICY_MISMATCH,
      QUESTION_SCOPE_VERSION_NOT_FOUND,
      QUESTION_SCOPE_VERSION_NOT_CURRENT,
    ]);
    for (const r of Object.values(QuestionScopeHook.refusals ?? {})) expect(r.message).toMatch(/[一-鿿]/);
  });

  it('runs before the answer hook, so a refused question never reaches the model', () => {
    expect(QuestionScopeHook.priority).toBe(QUESTION_SCOPE_PRIORITY);
    expect(QUESTION_SCOPE_PRIORITY).toBeLessThan(QuestionAnswerHook.priority ?? 100);
  });

  it('derives general when neither policy nor version is named, overriding a scope_kind in the payload', async () => {
    expect((await save({ question: 'q' })).data.scope_kind).toBe('general');
    expect((await save({ question: 'q', scope_kind: 'version' })).data.scope_kind).toBe('general');
  });

  it('derives policy when only the policy is named', async () => {
    const { data, reads } = await save({ question: 'q', scope_policy: 'pA' });
    expect(data.scope_kind).toBe('policy');
    expect(reads).toBe(0);
  });

  it('fills the policy from the version and derives version', async () => {
    const { data } = await save({ question: 'q', scope_version: 'vA3' });
    expect(data.scope_policy).toBe('pA');
    expect(data.scope_kind).toBe('version');
    // a version whose policy is stored as a record
    expect((await save({ question: 'q', scope_version: { id: 'vB1' } })).data.scope_policy).toBe('pB');
  });

  it('accepts the matching policy, as an id or as a record', async () => {
    expect(await refusal({ question: 'q', scope_policy: 'pA', scope_version: 'vA3' })).toBeUndefined();
    expect(await refusal({ question: 'q', scope_policy: { id: 'pB' }, scope_version: 'vB1' })).toBeUndefined();
  });

  it("refuses a policy that is not the version's", async () => {
    expect(await refusal({ question: 'q', scope_policy: 'pB', scope_version: 'vA3' })).toBe(QUESTION_SCOPE_POLICY_MISMATCH);
  });

  it('refuses a version that is not current (superseded or draft)', async () => {
    expect(await refusal({ question: 'q', scope_version: 'vA2' })).toBe(QUESTION_SCOPE_VERSION_NOT_CURRENT);
    expect(await refusal({ question: 'q', scope_version: 'vA4' })).toBe(QUESTION_SCOPE_VERSION_NOT_CURRENT);
  });

  it('refuses a version that does not exist or cannot be read', async () => {
    expect(await refusal({ question: 'q', scope_version: 'nope' })).toBe(QUESTION_SCOPE_VERSION_NOT_FOUND);
  });

  it('refuses moving the policy alone away from the stored version', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_version: 'vA3', scope_kind: 'version' };
    expect(await refusal({ scope_policy: 'pB' }, stored)).toBe(QUESTION_SCOPE_POLICY_MISMATCH);
  });

  it('moves the policy with the version on an update', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_version: 'vA3', scope_kind: 'version' };
    const { data } = await save({ scope_version: 'vB1' }, stored);
    expect(data.scope_policy).toBe('pB');
    expect(data.scope_kind).toBe('version');
  });

  it('refuses an update that points the question at a version that is not current', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_version: null, scope_kind: 'policy' };
    expect(await refusal({ scope_version: 'vA2' }, stored)).toBe(QUESTION_SCOPE_VERSION_NOT_CURRENT);
  });

  it('keeps the policy when the version is cleared', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_version: 'vA3', scope_kind: 'version' };
    const { data } = await save({ scope_version: null }, stored);
    expect(data.scope_kind).toBe('policy');
    expect('scope_policy' in data).toBe(false);
  });

  it('does not re-check an update that touches no scope field, even when the stored version is no longer current', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_version: 'vA2', scope_kind: 'version' };
    const { data, reads } = await save({ needs_human: true }, stored);
    expect(data).toEqual({ needs_human: true });
    expect(reads).toBe(0);
  });

  it('re-derives a scope_kind written alone on an update, without reading the version', async () => {
    const stored = { id: 'q1', scope_policy: 'pA', scope_version: 'vA2', scope_kind: 'version' };
    const { data, reads } = await save({ scope_kind: 'general' }, stored);
    expect(data.scope_kind).toBe('version');
    expect(reads).toBe(0);
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const { data } = await save({ question: 'q', scope_version: 'vA3' }, undefined, true);
    expect(data.scope_policy).toBe('pA');
    expect(data.scope_kind).toBe('version');
  });
});
