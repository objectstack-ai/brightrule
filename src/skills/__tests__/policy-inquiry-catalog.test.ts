import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';
import { PolicyInquirySkill } from '../policy-inquiry.skill.js';

type Row = Record<string, unknown>;

const instructions = (PolicyInquirySkill as { instructions?: string }).instructions ?? '';

// brightrule#71 — a question that names no policy narrows the catalog to the
// asker's unit chain (the platform states it, cloud#5099) before choosing,
// instead of paging through every policy.
describe('the policy-inquiry skill, on reading the catalog', () => {
  it("narrows by the asker's unit chain, with policies that have no owning unit kept", () => {
    expect(instructions).toContain('主单位链');
    expect(instructions).toContain('"owning_unit": { "$in": [链上全部 id] }');
    expect(instructions).toContain('"owning_unit": { "$null": true }');
    // Without a unit chain nothing is narrowed by unit.
    expect(instructions).toContain('没有单位链（未分配单位、系统提示里没有提问人）时不加单位条件');
  });

  it('reads pages of 200 and no longer pages to the end', () => {
    expect(instructions).toContain('limit 200');
    expect(instructions).not.toContain('翻页直到读完');
    expect(instructions).not.toContain('每页最多 50 条');
  });

  it('still asks for published policies on every catalog query (brightrule#70 relies on it too)', () => {
    expect(instructions).toContain('每次都带 status = "published"');
  });

  it('leaves out the catalog fields an answer does not use', () => {
    const fieldsLine = instructions.split('\n').find((l) => l.includes('读目录时只取字段'));
    expect(fieldsLine).toBeTruthy();
    for (const kept of ['id', 'display_name', 'title', 'doc_no', 'category', 'policy_level', 'owning_unit', 'summary']) {
      expect(fieldsLine).toContain(kept);
    }
    for (const dropped of ['issuing_unit', 'department', 'effective_date']) {
      expect(fieldsLine).not.toContain(dropped);
    }
  });
});

// The filter the skill teaches, run on the REAL engine (booted from source,
// in-memory database, the sample seed) as an employee: the shape compiles, and
// a 示例甲公司 employee's catalog holds the group's and 甲's policies and the
// ones with no owning unit, never 示例乙公司's.
describe("the skill's unit-chain filter on the engine", () => {
  let stack: VerifyStack;
  let employee: string;
  let chainOfA: string[];

  beforeAll(async () => {
    stack = await bootStack(config);
    const admin = await stack.signIn();
    const units = (await stack.rows('sys_business_unit', {}, { as: admin })) as Row[];
    const id = (code: string) => String(units.find((u) => u.code === code)?.id);
    chainOfA = [id('DEMO-A'), id('DEMO-GROUP')];
    await stack.hooks.run(
      'brightrule_policy',
      'insert',
      { title: '示例无单位合同用印细则', status: 'published', summary: '合同用印的申请与登记。' },
      { as: admin },
    );
    employee = await stack.signUp('catalog-reader@example.com');
  });

  afterAll(async () => {
    await stack?.stop();
  });

  const catalog = async (keyword: string) => {
    const where = {
      status: 'published',
      $and: [
        { $or: [{ owning_unit: { $in: chainOfA } }, { owning_unit: { $null: true } }] },
        { $or: [{ title: { $contains: keyword } }, { summary: { $contains: keyword } }] },
      ],
    };
    const rows = (await stack.rows('brightrule_policy', where, { as: employee })) as Row[];
    return rows.map((r) => String(r.title)).sort();
  };

  it("finds the group's policy, the asker's company's own, and one with no owning unit", async () => {
    expect(await catalog('合同')).toEqual(['关于转发《合同管理办法》的通知', '合同管理办法', '示例无单位合同用印细则'].sort());
  });

  it('leaves out a sibling company\'s policy on the same matter', async () => {
    expect(await catalog('信息安全')).toEqual(['信息安全管理规定']);
    expect(await catalog('档案')).toEqual([]);
  });
});
