import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { ClauseCurrentHook, CLAUSE_POLICY_NOT_FOUND } from '../policy-status.hook.js';

type Row = Record<string, unknown>;

const POLICIES: Row[] = [
  { id: 'pA', status: 'published' },
  { id: 'pB', status: 'draft' },
  { id: 'pC', status: 'abolished' },
];

/** Run the hook on a payload (and, for an update, the stored row); return the payload it leaves. */
async function save(data: Row, previous?: Row, flat = false): Promise<Row> {
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: { id: string } }) =>
        name === 'brightrule_policy' ? (POLICIES.find((p) => p.id === where.id) ?? null) : null,
    }),
  };
  const ctx = { input: flat ? data : { data }, previous, api } as unknown as HookContext;
  const handler = ClauseCurrentHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return data;
}

async function refusal(data: Row, previous?: Row): Promise<string | undefined> {
  try {
    await save(data, previous);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe("a clause's currency follows its policy's status", () => {
  it('declares a Chinese refusal for the rule it enforces', () => {
    expect(Object.keys(ClauseCurrentHook.refusals ?? {})).toEqual([CLAUSE_POLICY_NOT_FOUND]);
    for (const r of Object.values(ClauseCurrentHook.refusals ?? {})) expect(r.message).toMatch(/[一-鿿]/);
  });

  it('is current on insert exactly when the policy is published, whatever the payload says', async () => {
    expect((await save({ title: 't', policy: 'pA', is_current: false })).is_current).toBe(true);
    expect((await save({ title: 't', policy: 'pB', is_current: true })).is_current).toBe(false);
    expect((await save({ title: 't', policy: 'pC' })).is_current).toBe(false);
  });

  it('reads the policy as an id or as a record', async () => {
    expect((await save({ policy: { id: 'pA' } })).is_current).toBe(true);
  });

  it('refuses a policy that does not exist or cannot be read', async () => {
    expect(await refusal({ policy: 'nope' })).toBe(CLAUSE_POLICY_NOT_FOUND);
  });

  it('re-derives the flag when the clause moves to another policy', async () => {
    const d = await save({ policy: 'pB' }, { policy: 'pA', is_current: true });
    expect(d.is_current).toBe(false);
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const d = await save({ title: 't', policy: 'pA' }, undefined, true);
    expect(d.is_current).toBe(true);
  });

  it('leaves an update that does not move the clause alone (the policy hook writes is_current this way)', async () => {
    const d = await save({ is_current: false }, { policy: 'pA' });
    expect(d).toEqual({ is_current: false });
  });

  it('leaves a missing policy to the required check', async () => {
    expect(await save({ title: 't' })).toEqual({ title: 't' });
  });
});
