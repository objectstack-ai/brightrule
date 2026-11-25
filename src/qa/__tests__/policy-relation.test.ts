import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import {
  PolicyRelationHook,
  RELATION_DUPLICATE,
  RELATION_POLICY_MISMATCH,
  RELATION_SELF_REFERENCE,
  RELATION_VERSION_NOT_FOUND,
} from '../policy-relation.hook.js';

type Row = Record<string, unknown>;

const POLICIES: Row[] = [
  { id: 'pA', title: '差旅费报销管理办法' },
  { id: 'pB', title: '考勤与休假管理制度' },
  { id: 'pC', title: '  合同管理办法 ' },
];

const VERSIONS: Row[] = [
  { id: 'vA3', policy: 'pA', version_status: 'current' },
  { id: 'vA2', policy: 'pA', version_status: 'superseded' },
  { id: 'vC2', policy: 'pC', version_status: 'current' },
];

/** Relations already stored. */
const RELATIONS: Row[] = [
  { id: 'r1', from_version: 'vA3', from_policy: 'pA', relation_type: 'cites', to_policy: null, to_title: '《费用报销管理规定》' },
  { id: 'r2', from_version: 'vA3', from_policy: 'pA', relation_type: 'supplements', to_policy: 'pB', to_title: '《考勤与休假管理制度》' },
];

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);

/** Run the relation hook on a payload (and, for an update, the stored row); return the payload it leaves. */
async function save(data: Row, previous?: Row, flat = false): Promise<Row> {
  const tables: Record<string, Row[]> = {
    brightrule_policy: POLICIES,
    brightrule_policy_version: VERSIONS,
    brightrule_policy_relation: RELATIONS,
  };
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: Row }) => (tables[name] ?? []).find((r) => matches(r, where)) ?? null,
      find: async ({ where }: { where: Row }) => (tables[name] ?? []).filter((r) => matches(r, where)),
    }),
  };
  const ctx = { input: flat ? data : { data }, previous, api } as unknown as HookContext;
  const handler = PolicyRelationHook.handler as unknown as (c: HookContext) => Promise<void>;
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

describe('a policy relation keeps to its version', () => {
  it('declares a refusal for each rule it enforces', () => {
    expect(Object.keys(PolicyRelationHook.refusals ?? {})).toEqual([
      RELATION_POLICY_MISMATCH,
      RELATION_VERSION_NOT_FOUND,
      RELATION_SELF_REFERENCE,
      RELATION_DUPLICATE,
    ]);
    for (const refusal of Object.values(PolicyRelationHook.refusals ?? {})) {
      expect(refusal.message).toMatch(/[一-鿿]/);
    }
  });

  it('fills from_policy from the version', async () => {
    const d = await save({ from_version: 'vA3', relation_type: 'basis', to_title: '《集团授权管理办法》' });
    expect(d.from_policy).toBe('pA');
  });

  it('accepts the matching policy, as an id or as a record', async () => {
    expect(await refusal({ from_version: 'vA2', from_policy: 'pA', relation_type: 'basis', to_title: '《某规定》' })).toBeUndefined();
    const d = await save({ from_version: { id: 'vC2' }, from_policy: { id: 'pC' }, relation_type: 'basis', to_title: '《某规定》' });
    expect(d.from_policy).toEqual({ id: 'pC' });
  });

  it("refuses a from_policy that is not the version's", async () => {
    expect(await refusal({ from_version: 'vA3', from_policy: 'pB', relation_type: 'cites', to_title: '《X》' })).toBe(
      RELATION_POLICY_MISMATCH,
    );
  });

  it('refuses moving from_policy alone away from the version', async () => {
    const stored = { id: 'r9', from_version: 'vA3', from_policy: 'pA', relation_type: 'cites', to_title: '《X》' };
    expect(await refusal({ from_policy: 'pB' }, stored)).toBe(RELATION_POLICY_MISMATCH);
  });

  it('moves from_policy with the version', async () => {
    const stored = { id: 'r9', from_version: 'vA3', from_policy: 'pA', relation_type: 'cites', to_title: '《X》' };
    expect((await save({ from_version: 'vC2' }, stored)).from_policy).toBe('pC');
  });

  it('refuses a version that does not exist or cannot be read', async () => {
    expect(await refusal({ from_version: 'nope', relation_type: 'cites', to_title: '《X》' })).toBe(RELATION_VERSION_NOT_FOUND);
  });

  it('refuses a relation to its own policy', async () => {
    expect(await refusal({ from_version: 'vA3', relation_type: 'supersedes', to_policy: 'pA', to_title: '《差旅费报销管理办法》' })).toBe(
      RELATION_SELF_REFERENCE,
    );
    // also when only the target changes on an update
    expect(await refusal({ to_policy: { id: 'pA' } }, RELATIONS[1])).toBe(RELATION_SELF_REFERENCE);
  });

  it('refuses a second identical relation to a policy outside the library, by normalized name', async () => {
    expect(await refusal({ from_version: 'vA3', relation_type: 'cites', to_title: '《费用报销管理规定》' })).toBe(RELATION_DUPLICATE);
    expect(await refusal({ from_version: 'vA3', relation_type: 'cites', to_title: ' 费用报销管理规定 ' })).toBe(RELATION_DUPLICATE);
  });

  it('refuses a second identical relation to a library policy', async () => {
    expect(await refusal({ from_version: 'vA3', relation_type: 'supplements', to_policy: 'pB', to_title: '考勤制度' })).toBe(
      RELATION_DUPLICATE,
    );
  });

  it('allows the same target under another type, in another version, or by another policy', async () => {
    expect(await refusal({ from_version: 'vA3', relation_type: 'basis', to_title: '《费用报销管理规定》' })).toBeUndefined();
    expect(await refusal({ from_version: 'vA2', relation_type: 'cites', to_title: '《费用报销管理规定》' })).toBeUndefined();
    expect(await refusal({ from_version: 'vA3', relation_type: 'supplements', to_policy: 'pC' })).toBeUndefined();
  });

  it('does not count the record itself as a duplicate on update', async () => {
    expect(await refusal({ to_title: '费用报销管理规定' }, RELATIONS[0])).toBeUndefined();
    expect(await refusal({ relation_type: 'supplements', to_policy: 'pB' }, RELATIONS[1])).toBeUndefined();
  });

  it('refuses an update that turns a relation into a duplicate of another', async () => {
    const stored = { id: 'r9', from_version: 'vA3', from_policy: 'pA', relation_type: 'basis', to_title: '《费用报销管理规定》' };
    expect(await refusal({ relation_type: 'cites' }, stored)).toBe(RELATION_DUPLICATE);
  });

  it("fills to_title as 《title》 from the target policy when it is empty", async () => {
    expect((await save({ from_version: 'vA3', relation_type: 'basis', to_policy: 'pC' })).to_title).toBe('《合同管理办法》');
    expect((await save({ from_version: 'vA3', relation_type: 'basis', to_policy: 'pC', to_title: '  ' })).to_title).toBe(
      '《合同管理办法》',
    );
  });

  it('keeps a to_title the caller gave', async () => {
    expect((await save({ from_version: 'vA3', relation_type: 'basis', to_policy: 'pC', to_title: '合同办法' })).to_title).toBe(
      '合同办法',
    );
  });

  it('re-fills to_title when an update moves to_policy to another policy and names no title', async () => {
    const stored = { id: 'r9', from_version: 'vC2', from_policy: 'pC', relation_type: 'basis', to_policy: 'pB', to_title: '《考勤与休假管理制度》' };
    expect((await save({ to_policy: 'pA' }, stored)).to_title).toBe('《差旅费报销管理办法》');
    // A title given in the same update wins; re-sending the same target changes nothing.
    expect((await save({ to_policy: 'pA', to_title: '差旅办法' }, stored)).to_title).toBe('差旅办法');
    expect((await save({ to_policy: 'pB' }, stored)).to_title).toBeUndefined();
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const d = await save({ from_version: 'vC2', relation_type: 'cites', to_policy: 'pB' }, undefined, true);
    expect(d.from_policy).toBe('pC');
    expect(d.to_title).toBe('《考勤与休假管理制度》');
  });

  it('leaves an update that touches only unrelated fields alone, even on a row that would now be refused', async () => {
    // A stored row that duplicates r1: confirming it is not re-checked.
    const stored = { id: 'r9', from_version: 'vA3', from_policy: 'pB', relation_type: 'cites', to_title: '《费用报销管理规定》' };
    const d = await save({ confirmed: true, from_articles: '第三条、第十四条', source: 'manual' }, stored);
    expect(d).toEqual({ confirmed: true, from_articles: '第三条、第十四条', source: 'manual' });
  });
});
