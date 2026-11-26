import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { PolicyTrialHook } from '../policy-trial.hook.js';

type Row = Record<string, unknown>;

/** Run the trial hook on a payload (and, for an update, the stored row); answer the payload as it leaves. */
async function save(input: Row, previous?: Row, flat = false): Promise<Row> {
  const data = { ...input };
  const ctx = { input: flat ? data : { data, id: data.id }, previous } as unknown as HookContext;
  const handler = PolicyTrialHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return data;
}

describe("a policy's 试行 flag", () => {
  it('runs before every write of a policy and refuses nothing', () => {
    expect(PolicyTrialHook.object).toBe('brightrule_policy');
    expect(PolicyTrialHook.events).toEqual(['beforeInsert', 'beforeUpdate']);
    expect(PolicyTrialHook.refusals ?? {}).toEqual({});
  });

  it('is set on insert when the title says 试行 or 暂行, whatever the payload says', async () => {
    expect((await save({ title: '档案管理办法（试行）' })).is_trial).toBe(true);
    expect((await save({ title: '印章使用暂行规定' })).is_trial).toBe(true);
    expect((await save({ title: '合同管理办法', is_trial: true })).is_trial).toBe(false);
    // A lowered body hands the payload as `ctx.input` itself.
    expect((await save({ title: '公文处理办法（试行）' }, undefined, true)).is_trial).toBe(true);
  });

  it('follows a changed title: taking 试行 out turns it off, putting 暂行 in turns it on', async () => {
    const trial = { id: 'p1', title: '档案管理办法（试行）', is_trial: true };
    expect((await save({ title: '档案管理办法' }, trial)).is_trial).toBe(false);
    const plain = { id: 'p2', title: '印章使用规定', is_trial: false };
    expect((await save({ title: '印章使用暂行规定' }, plain)).is_trial).toBe(true);
  });

  it('is left alone by an update that does not change the title', async () => {
    const stored = { id: 'p1', title: '档案管理办法（试行）', is_trial: false };
    // Not in the payload: the flag is not written at all.
    expect(await save({ status: 'published' }, stored)).not.toHaveProperty('is_trial');
    // The same title a form sends back keeps a maintainer's correction.
    expect(await save({ title: stored.title, status: 'published' }, stored)).not.toHaveProperty('is_trial');
    expect((await save({ title: stored.title, is_trial: true }, stored)).is_trial).toBe(true);
  });

  it('leaves a payload without a usable title to the field checks', async () => {
    expect(await save({ title: null })).not.toHaveProperty('is_trial');
    expect(await save({ summary: '无标题' })).not.toHaveProperty('is_trial');
  });
});
