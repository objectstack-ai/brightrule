import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';

type Row = Record<string, unknown>;

const POLICY = 'brightrule_policy';

// Per-company visibility (docs/visibility.md 第 5 节) on the REAL engine. The
// policy is private; the environment's own sharing rules on `owning_unit`
// open it: the group's policies to the whole tree, a company's to that
// company and its units, and every company's to the group office. The sample
// seed's tree is 示例集团 (whose policies are the group's) with 示例甲公司 and
// 示例乙公司 under it; the test adds 集团机关 beside them, as the import does
// in a real environment.
describe('按单位隔离制度可见性', () => {
  let stack: VerifyStack;
  let admin: string;
  const unit: Record<string, string> = {};
  const people: Record<string, string> = {};

  const create = async (object: string, body: Row) => {
    const res = await stack.apiAs(admin, 'POST', `/data/${object}`, body);
    expect(res.status, `${object} ${await res.clone().text()}`).toBe(201);
    return (await res.json()) as Row;
  };
  const titles = async (who: string) =>
    ((await stack.rows(POLICY, {}, { as: people[who] })) as Row[]).map((r) => String(r.owning_unit));

  beforeAll(async () => {
    stack = await bootStack(config);
    admin = await stack.signIn();
    for (const [key, code] of [['group', 'DEMO-GROUP'], ['a', 'DEMO-A'], ['b', 'DEMO-B']] as const) {
      [{ id: unit[key] }] = (await stack.rows('sys_business_unit', { code })) as { id: string }[];
    }
    unit.office = String((await create('sys_business_unit', { name: '示例集团机关', code: 'DEMO-OFFICE', kind: 'department', parent_business_unit_id: unit.group })).id);
    unit.aDept = String((await create('sys_business_unit', { name: '示例甲公司综合部', code: 'DEMO-A-ADMIN', kind: 'department', parent_business_unit_id: unit.a })).id);

    for (const [who, at] of [['office', 'office'], ['a', 'aDept'], ['b', 'b']] as const) {
      people[who] = await stack.signUp(`${who}@example.com`);
      await create('sys_business_unit_member', { user_id: (await stack.contextFor(people[who])).userId, business_unit_id: unit[at], is_primary: true });
    }
    people.nobody = await stack.signUp('nobody@example.com');

    const rule = (name: string, owning: string, type: string, recipient: string) =>
      create('sys_sharing_rule', {
        name, label: name, object_name: POLICY, criteria_json: JSON.stringify({ owning_unit: owning }),
        recipient_type: type, recipient_id: recipient, access_level: 'read', active: true,
      });
    await rule('policy_group_all', unit.group, 'unit_and_subordinates', unit.group);
    for (const c of ['a', 'b']) {
      await rule(`policy_${c}_own`, unit[c], 'unit_and_subordinates', unit[c]);
      await rule(`policy_${c}_group_office`, unit[c], 'unit_and_subordinates', unit.office);
    }
  });

  afterAll(async () => {
    await stack?.stop();
  });

  it('a company employee reads the group policies and their own company’s, never a sister company’s', async () => {
    const a = await titles('a');
    expect(a).toContain(unit.group);
    expect(a).toContain(unit.a);
    expect(a).not.toContain(unit.b);
    const b = await titles('b');
    expect(new Set(b)).toEqual(new Set([unit.group, unit.b]));
  });

  it('the group office reads the group policies and every subsidiary’s', async () => {
    expect(new Set(await titles('office'))).toEqual(new Set([unit.group, unit.a, unit.b]));
  });

  it('a person in no unit reads no policy', async () => {
    expect(await titles('nobody')).toEqual([]);
  });
});
