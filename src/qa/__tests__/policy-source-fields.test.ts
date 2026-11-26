import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';

type Row = Record<string, unknown>;
const refId = (v: unknown) => (v && typeof v === 'object' ? (v as Row).id : v);

// The fields a policy's issuing notice carries (brightrule#52), on the REAL
// engine (booted from source, in-memory database, the sample seed).
describe("a policy's source fields on the engine", () => {
  let stack: VerifyStack;
  let as: string;

  beforeAll(async () => {
    stack = await bootStack(config);
    as = await stack.signIn();
  });

  afterAll(async () => {
    await stack?.stop();
  });

  const insert = async (data: Row) => (await stack.hooks.run('brightrule_policy', 'insert', data, { as })) as Row;
  const read = async (id: unknown) => ((await stack.rows('brightrule_policy', { id }, { as })) as Row[])[0];

  it('files a new policy as 印发 unless it says otherwise', async () => {
    expect((await insert({ title: '示例印发制度' })).issuance_type).toBe('issue');
    expect((await insert({ title: '示例转发制度', issuance_type: 'forward' })).issuance_type).toBe('forward');
  });

  it('derives 试行 from the title on insert and when the title changes, and only then', async () => {
    const policy = await insert({ title: '示例公文处理办法（试行）' });
    expect((await read(policy.id)).is_trial).toBe(true);

    await stack.hooks.run('brightrule_policy', 'update', { id: policy.id, title: '示例公文处理办法' }, { as });
    expect((await read(policy.id)).is_trial).toBe(false);

    await stack.hooks.run('brightrule_policy', 'update', { id: policy.id, title: '示例公文处理暂行办法' }, { as });
    expect((await read(policy.id)).is_trial).toBe(true);

    await stack.hooks.run('brightrule_policy', 'update', { id: policy.id, summary: '只改摘要' }, { as });
    expect((await read(policy.id)).is_trial).toBe(true);
  });

  it('points each seeded policy at a seeded business unit, and the subsidiaries under the group', async () => {
    const units = (await stack.rows('sys_business_unit', {}, { as })) as Row[];
    const byId = new Map(units.map((u) => [u.id, u]));
    const group = units.find((u) => u.code === 'DEMO-GROUP')!;
    expect(group).toBeTruthy();
    for (const code of ['DEMO-A', 'DEMO-B']) {
      expect(refId(units.find((u) => u.code === code)?.parent_business_unit_id)).toBe(group.id);
    }

    const policies = (await stack.rows('brightrule_policy', { status: 'published' }, { as })) as Row[];
    const owners = new Set<unknown>();
    for (const p of policies) {
      const unit = byId.get(refId(p.owning_unit));
      expect(unit, String(p.title)).toBeTruthy();
      owners.add(unit!.code);
    }
    expect(owners.size).toBeGreaterThanOrEqual(2);
  });

  it("lets an employee read the business units, so a policy's 所属单位 shows its name", async () => {
    const employee = await stack.signUp('unit-reader@example.com');
    const units = (await stack.rows('sys_business_unit', {}, { as: employee })) as Row[];
    expect(units.map((u) => u.code)).toEqual(expect.arrayContaining(['DEMO-GROUP', 'DEMO-A', 'DEMO-B']));
    const res = await stack.apiAs(employee, 'POST', '/data/sys_business_unit', { name: '员工新建的单位', kind: 'company' });
    expect(res.status).toBe(403);
  });

  it('links a seeded forwarded policy to the group policy it forwards', async () => {
    const [forward] = (await stack.rows('brightrule_policy', { issuance_type: 'forward', status: 'published' }, { as })) as Row[];
    const [parent] = (await stack.rows('brightrule_policy', { title: '合同管理办法' }, { as })) as Row[];
    expect(refId(forward.parent_policy)).toBe(parent.id);
  });
});
