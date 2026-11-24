import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { ClauseCurrentHook, CLAUSE_POLICY_MISMATCH, CLAUSE_VERSION_NOT_FOUND } from '../version-current.hook.js';

type Row = Record<string, unknown>;

const VERSIONS: Row[] = [
  { id: 'vA3', policy: 'pA', version_status: 'current' },
  { id: 'vA2', policy: 'pA', version_status: 'superseded' },
  { id: 'vB1', policy: 'pB', version_status: 'current' },
];

/** Run the hook on a payload (and, for an update, the stored row); return the payload it leaves. */
async function save(data: Row, previous?: Row, flat = false): Promise<Row> {
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: { id: string } }) =>
        name === 'brightrule_policy_version' ? (VERSIONS.find((v) => v.id === where.id) ?? null) : null,
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

describe('a clause keeps its policy and version in step', () => {
  it('declares a refusal for each rule it enforces', () => {
    expect(Object.keys(ClauseCurrentHook.refusals ?? {})).toEqual([CLAUSE_POLICY_MISMATCH, CLAUSE_VERSION_NOT_FOUND]);
  });

  it('fills the policy from the version when only the version is given', async () => {
    const d = await save({ title: 't', policy_version: 'vA3' });
    expect(d.policy).toBe('pA');
    expect(d.is_current).toBe(true);
  });

  it('accepts the matching policy, as an id or as a record', async () => {
    expect((await save({ policy: 'pA', policy_version: 'vA2' })).is_current).toBe(false);
    expect((await save({ policy: { id: 'pB' }, policy_version: { id: 'vB1' } })).policy).toEqual({ id: 'pB' });
  });

  it("refuses a policy that is not the version's", async () => {
    expect(await refusal({ policy: 'pB', policy_version: 'vA3' })).toBe(CLAUSE_POLICY_MISMATCH);
  });

  it('refuses a version that does not exist or cannot be read', async () => {
    expect(await refusal({ policy: 'pA', policy_version: 'nope' })).toBe(CLAUSE_VERSION_NOT_FOUND);
  });

  it('moves the clause with its version, and its currency with it', async () => {
    const d = await save({ policy_version: 'vB1' }, { policy: 'pA', policy_version: 'vA2', is_current: false });
    expect(d.policy).toBe('pB');
    expect(d.is_current).toBe(true);
  });

  it('refuses moving the policy alone away from the version', async () => {
    expect(await refusal({ policy: 'pB' }, { policy: 'pA', policy_version: 'vA3' })).toBe(CLAUSE_POLICY_MISMATCH);
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const d = await save({ title: 't', policy_version: 'vB1' }, undefined, true);
    expect(d.policy).toBe('pB');
    expect(d.is_current).toBe(true);
  });

  it('leaves an update that touches neither parent alone', async () => {
    const d = await save({ is_current: false }, { policy: 'pA', policy_version: 'vA3' });
    expect(d).toEqual({ is_current: false });
  });
});
