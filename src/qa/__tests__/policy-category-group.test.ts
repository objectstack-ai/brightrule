import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { PolicyCategoryGroupHook } from '../policy-category-group.hook.js';
import { Policy } from '../../objects/policy.object.js';

type Row = Record<string, unknown>;

/** Run the class hook on a payload (and, for an update, the stored row); answer the payload as it leaves. */
async function save(input: Row, previous?: Row, flat = false): Promise<Row> {
  const data = { ...input };
  const ctx = { input: flat ? data : { data, id: data.id }, previous } as unknown as HookContext;
  const handler = PolicyCategoryGroupHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return data;
}

const optionValues = (field: string) =>
  ((Policy.fields as Record<string, { options?: { value: string }[] }>)[field].options ?? []).map((o) => o.value);

describe("a policy's 制度大类", () => {
  it('runs before every write of a policy and refuses nothing', () => {
    expect(PolicyCategoryGroupHook.object).toBe('brightrule_policy');
    expect(PolicyCategoryGroupHook.events).toEqual(['beforeInsert', 'beforeUpdate']);
    expect(PolicyCategoryGroupHook.refusals ?? {}).toEqual({});
  });

  it('is set on insert from the category, whatever the payload says', async () => {
    expect((await save({ title: '董事会议事规则', category: 'governance' })).category_group).toBe('governance');
    expect((await save({ title: '纪检监察工作规定', category: 'party', category_group: 'operations' })).category_group).toBe('party');
    expect((await save({ title: '差旅费报销管理办法', category: 'finance' })).category_group).toBe('operations');
    // A lowered body hands the payload as `ctx.input` itself.
    expect((await save({ title: '投资管理制度', category: 'strategy' }, undefined, true)).category_group).toBe('operations');
  });

  it('maps every 小类 to one of the three classes', async () => {
    const classes = optionValues('category_group');
    for (const category of optionValues('category')) {
      expect(classes).toContain((await save({ category })).category_group);
    }
    expect(optionValues('category')).toHaveLength(12);
  });

  it('follows a changed category', async () => {
    const stored = { id: 'p1', category: 'party', category_group: 'party' };
    expect((await save({ category: 'finance' }, stored)).category_group).toBe('operations');
    expect((await save({ category: 'governance' }, stored)).category_group).toBe('governance');
  });

  it('is left alone by an update that does not change the category', async () => {
    const stored = { id: 'p1', category: 'finance', category_group: 'governance' };
    expect(await save({ status: 'published' }, stored)).not.toHaveProperty('category_group');
    // The same category a form sends back keeps a maintainer's correction.
    expect(await save({ category: 'finance', category_group: 'governance' }, stored)).toHaveProperty('category_group', 'governance');
  });

  it('leaves a payload without a usable category alone', async () => {
    expect(await save({ category: null })).not.toHaveProperty('category_group');
    expect(await save({ category: '' })).not.toHaveProperty('category_group');
    expect(await save({ title: '无分类' })).not.toHaveProperty('category_group');
  });
});

describe("a policy's 制度层级", () => {
  it('is one of the three levels of the policy system', () => {
    expect(optionValues('policy_level')).toEqual(['level_1', 'level_2', 'level_3']);
  });
});
