import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { PolicySuggestionIntakeHook } from '../policy-suggestion-intake.hook.js';
import { PolicySuggestion } from '../../objects/policy-suggestion.object.js';
import { BrightRuleSeedData } from '../../data/seed.js';

type Row = Record<string, unknown>;

/** Run the intake hook on a payload (and, for an update, the stored row); answer the payload as it leaves. */
async function save(input: Row, previous?: Row, flat = false): Promise<Row> {
  const data = { ...input };
  const ctx = { input: flat ? data : { data, id: data.id }, previous } as unknown as HookContext;
  const handler = PolicySuggestionIntakeHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return data;
}

const optionValues = (field: string) =>
  ((PolicySuggestion.fields as Record<string, { options?: { value: string }[] }>)[field].options ?? []).map((o) => o.value);

describe('制度意见 intake', () => {
  it('runs before every write of an opinion and refuses nothing', () => {
    expect(PolicySuggestionIntakeHook.object).toBe('brightrule_policy_suggestion');
    expect(PolicySuggestionIntakeHook.events).toEqual(['beforeInsert', 'beforeUpdate']);
    expect(PolicySuggestionIntakeHook.refusals ?? {}).toEqual({});
  });

  it('sorts the 11 categories into the three classes', async () => {
    expect(optionValues('category')).toHaveLength(11);
    const expected: Record<string, string> = { policy_gap: 'unmatched', not_found: 'unmatched', metadata_error: 'metadata' };
    for (const category of optionValues('category')) {
      expect((await save({ category, finding: 'x' })).category_group, category).toBe(expected[category] ?? 'defect');
    }
    expect(new Set(optionValues('category_group'))).toEqual(new Set(['defect', 'unmatched', 'metadata']));
  });

  it('never keeps a 大类 written directly, and clears it with the category', async () => {
    expect((await save({ finding: 'x', category_group: 'metadata' })).category_group).toBeUndefined();
    expect((await save({ id: '1', category: 'compliance', category_group: 'metadata' }, { status: 'open' })).category_group).toBe('defect');
    expect((await save({ id: '1', category: null }, { status: 'open', category: 'compliance' })).category_group).toBeNull();
    expect((await save({ id: '1', finding: '改写' }, { status: 'open', category: 'compliance' })).category_group).toBeUndefined();
  });

  it('files a new opinion as 员工提交, to 待分诊 without a category and 待处理 with one', async () => {
    expect(await save({ finding: 'x' })).toMatchObject({ source: 'employee', status: 'triage' });
    expect(await save({ finding: 'x', category: 'ambiguity' }, undefined, true)).toMatchObject({ source: 'employee', status: 'open' });
    expect(await save({ finding: 'x', source: 'ai_diagnosis', status: 'discussing' })).toMatchObject({ source: 'ai_diagnosis', status: 'discussing' });
  });

  it('leaves 来源 and 处理状态 alone on update', async () => {
    const out = await save({ id: '1', finding: '改写' }, { status: 'open', source: 'employee' });
    expect(out.source).toBeUndefined();
    expect(out.status).toBeUndefined();
  });

  it('agrees with the seed: each seeded opinion names the class its category derives', async () => {
    const dataset = BrightRuleSeedData.find((d) => d.object === 'brightrule_policy_suggestion')!;
    const records = dataset.records as Row[];
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r.category_group).toBe((await save({ category: r.category, finding: 'x' })).category_group);
    }
  });
});
