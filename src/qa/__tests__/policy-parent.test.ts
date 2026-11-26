import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { POLICY_PARENT_SELF, PolicyParentHook } from '../policy-parent.hook.js';

type Row = Record<string, unknown>;

/** Run the parent hook on a payload (and, for an update, the stored row); answer its refusal code. */
async function refusal(input: Row, previous?: Row, flat = false): Promise<string | undefined> {
  const ctx = { input: flat ? input : { data: input, id: input.id }, previous } as unknown as HookContext;
  const handler = PolicyParentHook.handler as unknown as (c: HookContext) => Promise<void>;
  try {
    await handler(ctx);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe("a policy's 上级制度", () => {
  it('runs on every write of a policy, and declares a Chinese refusal', () => {
    expect(PolicyParentHook.object).toBe('brightrule_policy');
    expect(PolicyParentHook.events).toEqual(['beforeInsert', 'beforeUpdate']);
    expect(Object.keys(PolicyParentHook.refusals ?? {})).toEqual([POLICY_PARENT_SELF]);
    for (const r of Object.values(PolicyParentHook.refusals ?? {})) {
      expect(r.message).toMatch(/[一-鿿]/);
      expect(r.status).toBe(400);
    }
  });

  it('refuses an update that names the policy itself, as an id or as a record', async () => {
    const stored = { id: 'p1', title: '差旅费报销管理办法' };
    expect(await refusal({ parent_policy: 'p1' }, stored)).toBe(POLICY_PARENT_SELF);
    expect(await refusal({ parent_policy: { id: 'p1' } }, stored)).toBe(POLICY_PARENT_SELF);
    // A lowered body hands the payload as `ctx.input` itself.
    expect(await refusal({ id: 'p1', parent_policy: 'p1' }, stored, true)).toBe(POLICY_PARENT_SELF);
  });

  it('refuses an insert whose payload carries its own id as the parent', async () => {
    expect(await refusal({ id: 'p9', title: '新制度', parent_policy: 'p9' })).toBe(POLICY_PARENT_SELF);
  });

  it('accepts another policy, a cleared parent and a save that does not touch it', async () => {
    const stored = { id: 'p1', parent_policy: 'p0' };
    expect(await refusal({ parent_policy: 'p2' }, stored)).toBeUndefined();
    expect(await refusal({ parent_policy: null }, stored)).toBeUndefined();
    expect(await refusal({ parent_policy: '' }, stored)).toBeUndefined();
    expect(await refusal({ title: '改个名' }, stored)).toBeUndefined();
    expect(await refusal({ title: '新制度', parent_policy: 'p1' })).toBeUndefined();
  });
});
