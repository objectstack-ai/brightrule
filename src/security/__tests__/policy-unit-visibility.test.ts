import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import { MCPServerPlugin } from '@objectstack/mcp';
import config from '../../../objectstack.config';
import { RULE_PREFIX, owningUnits, reconcilePolicyUnitRules, ruleNameFor } from '../../../scripts/sharing/policy-unit-sharing.mjs';

type Row = Record<string, unknown>;
type Key = 'G' | 'A' | 'A1' | 'B';

const POLICY = 'brightrule_policy';
const ATTACHMENT = 'brightrule_policy_attachment';
const SUGGESTION = 'brightrule_policy_suggestion';
const KEYS: Key[] = ['G', 'A', 'A1', 'B'];

const idOf = (v: unknown) => (v && typeof v === 'object' ? String((v as Row).id) : String(v));

// 制度按所属单位隔离可见性 on the REAL engine (brightrule#74, docs/visibility.md
// dimension 2 and section 8): the policy object is private, and one sharing
// rule per owning unit — written by scripts/sharing/policy-unit-sharing.mjs —
// opens a unit's policies to that unit and every unit under it.
//
// Unit tree: 示例集团 (G) → 示例甲公司 (A) → 示例甲一分公司 (A1); 示例集团 → 示例乙公司 (B).
// Each unit has one employee and one policy with one attachment.
describe('制度按所属单位隔离可见性', () => {
  let stack: VerifyStack;
  let devAdmin: string;
  let officer: string;
  const unit = {} as Record<Key, string>;
  const emp = {} as Record<Key | 'none', string>;
  const membership = {} as Record<Key, string>;
  const pol = {} as Record<Key, string>;
  const att = {} as Record<Key, string>;

  // The operator: the platform's dev admin, who holds manage_sharing and sees
  // every policy (what the script's header asks of whoever runs it).
  const asAdmin = (method: string, path: string, body?: unknown) => stack.apiAs(devAdmin, method, path, body);
  const reconcile = (opts?: { dryRun?: boolean }) => reconcilePolicyUnitRules(asAdmin, opts);
  const unitRules = async () => {
    const listed = (await (await asAdmin('GET', `/sharing/rules?object=${POLICY}`)).json()) as { data: Row[] };
    return listed.data.filter((r) => String(r.name).startsWith(RULE_PREFIX));
  };

  const userId = async (token: string) => (await stack.contextFor(token)).userId as string;
  const joinUnit = async (token: string, unitId: string) => {
    const res = await asAdmin('POST', '/data/sys_business_unit_member', { business_unit_id: unitId, user_id: await userId(token) });
    const body = (await res.json()) as Row;
    expect(res.status, JSON.stringify(body)).toBe(201);
    return String(body.id ?? (body.record as Row)?.id);
  };
  const setParent = async (child: string, parent: string) => {
    const res = await asAdmin('PATCH', `/data/sys_business_unit/${child}`, { parent_business_unit_id: parent });
    expect(res.status, await res.text()).toBe(200);
  };
  const setOwningUnit = async (policy: string, unitId: string) => {
    await stack.hooks.run(POLICY, 'update', { id: policy, owning_unit: unitId }, { as: officer });
  };

  /**
   * Which of the four sample records `token` reads. Asked twice — the list
   * (`find`) and the record by id over REST (`findOne`) — and the two must agree.
   */
  const visible = async (token: string, object = POLICY, ids: Record<Key, string> = pol) => {
    const listed = new Set(((await stack.rows(object, {}, { as: token })) as Row[]).map((r) => String(r.id)));
    const out: Key[] = [];
    for (const k of KEYS) {
      const one = await stack.apiAs(token, 'GET', `/data/${object}/${ids[k]}`);
      expect([200, 404], `${object} ${k}: GET by id answered ${one.status}`).toContain(one.status);
      expect(one.status === 200, `${object} ${k}: the list and GET by id disagree`).toBe(listed.has(ids[k]));
      if (listed.has(ids[k])) out.push(k);
    }
    return out;
  };

  /** One MCP tool call over the HTTP door, as `token`; the tool's JSON answer. */
  const mcp = async (token: string, name: string, args: Row) => {
    const res = await stack.api('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    return { isError: !!body.result.isError, data: JSON.parse(body.result.content[0].text) as Row };
  };

  beforeAll(async () => {
    // The MCP server is a decision of the serving process, not of the config:
    // the test mounts it to read through the same tools an AI client uses.
    stack = await bootStack(config, { extraPlugins: [new MCPServerPlugin({ transport: 'http' })] });
    devAdmin = await stack.signIn();

    const units = (await stack.rows('sys_business_unit')) as Row[];
    const byCode = (code: string) => String(units.find((u) => u.code === code)!.id);
    unit.G = byCode('DEMO-GROUP');
    unit.A = byCode('DEMO-A');
    unit.B = byCode('DEMO-B');
    const a1 = await asAdmin('POST', '/data/sys_business_unit', {
      name: '示例甲一分公司',
      code: 'DEMO-A1',
      kind: 'company',
      parent_business_unit_id: unit.A,
    });
    expect(a1.status, await a1.clone().text()).toBe(201);
    unit.A1 = String(((await stack.rows('sys_business_unit', { code: 'DEMO-A1' })) as Row[])[0].id);

    // The seed has policies of the group, 甲 and 乙; 甲一 gets one of its own.
    const policies = (await stack.rows(POLICY)) as Row[];
    const firstOf = (u: string) => String(policies.find((p) => idOf(p.owning_unit) === u)!.id);
    pol.G = firstOf(unit.G);
    pol.A = firstOf(unit.A);
    pol.B = firstOf(unit.B);
    const [p1] = (await stack.seed(POLICY, [
      { title: '车辆管理办法', owning_unit: unit.A1, status: 'published', body_md: '第一条 公务用车须登记。' },
    ])) as Row[];
    pol.A1 = String(p1.id);
    for (const k of KEYS) {
      const [a] = (await stack.seed(ATTACHMENT, [{ title: `${k} 附表`, label: '附表1', sort_no: 1, policy: pol[k] }])) as Row[];
      att[k] = String(a.id);
    }

    for (const k of KEYS) {
      emp[k] = await stack.signUp(`emp-${k.toLowerCase()}@example.com`);
      membership[k] = await joinUnit(emp[k], unit[k]);
    }
    emp.none = await stack.signUp('emp-none@example.com');
    officer = await stack.signUp('officer@example.com');
    const grant = await asAdmin('POST', '/data/sys_user_permission_set', {
      user_id: await userId(officer),
      permission_set: 'brightrule_policy_admin',
    });
    expect(grant.status).toBe(201);
  });

  afterAll(async () => {
    await stack?.stop();
  });

  it('hides every policy from an employee while no unit rule exists (deny first)', async () => {
    expect(await visible(emp.A1)).toEqual([]);
    expect(await visible(emp.G)).toEqual([]);
    expect(await visible(officer)).toEqual(KEYS);
  });

  it('refuses to reconcile for a caller without manage_sharing', async () => {
    const asOfficer = (method: string, path: string, body?: unknown) => stack.apiAs(officer, method, path, body);
    await expect(reconcilePolicyUnitRules(asOfficer)).rejects.toThrow(/403/);
    expect(await unitRules()).toEqual([]);
  });

  it('counts the owning units over every page of policies', async () => {
    const all = (await stack.rows(POLICY)) as Row[];
    const whole = await owningUnits(asAdmin);
    expect(whole.total).toBe(all.length);
    expect([...whole.counts.keys()].sort()).toEqual(KEYS.map((k) => unit[k]).sort());
    // Pages of two: the same answer, so a large library is read to its end.
    const paged = await owningUnits(asAdmin, { pageSize: 2 });
    expect(paged.total).toBe(all.length);
    expect([...paged.counts.entries()].sort()).toEqual([...whole.counts.entries()].sort());
  });

  it('plans without writing on a dry run', async () => {
    const plan = await reconcile({ dryRun: true });
    expect(plan.created.sort()).toEqual(KEYS.map((k) => ruleNameFor(unit[k])).sort());
    expect(await unitRules()).toEqual([]);
  });

  it('creates one read rule per owning unit, shared with the unit and its subordinates', async () => {
    const out = await reconcile();
    expect(out.created.sort()).toEqual(KEYS.map((k) => ruleNameFor(unit[k])).sort());
    expect(out.updated).toEqual([]);
    expect(out.removed).toEqual([]);
    const rules = await unitRules();
    expect(rules).toHaveLength(4);
    const a = rules.find((r) => r.name === ruleNameFor(unit.A))!;
    expect(a).toMatchObject({
      object_name: POLICY,
      criteria: { owning_unit: unit.A },
      recipient_type: 'unit_and_subordinates',
      recipient_id: unit.A,
      access_level: 'read',
      active: true,
      label: '制度按单位共享：示例甲公司',
    });
  });

  it('serves the acceptance matrix on policies', async () => {
    expect(await visible(emp.G)).toEqual(['G']);
    expect(await visible(emp.A)).toEqual(['G', 'A']);
    expect(await visible(emp.A1)).toEqual(['G', 'A', 'A1']);
    expect(await visible(emp.B)).toEqual(['G', 'B']);
    expect(await visible(emp.none)).toEqual([]);
    expect(await visible(officer)).toEqual(KEYS);
  });

  it('serves the same matrix on attachments, which follow their policy', async () => {
    expect(await visible(emp.G, ATTACHMENT, att)).toEqual(['G']);
    expect(await visible(emp.A, ATTACHMENT, att)).toEqual(['G', 'A']);
    expect(await visible(emp.A1, ATTACHMENT, att)).toEqual(['G', 'A', 'A1']);
    expect(await visible(emp.B, ATTACHMENT, att)).toEqual(['G', 'B']);
    expect(await visible(emp.none, ATTACHMENT, att)).toEqual([]);
    expect(await visible(officer, ATTACHMENT, att)).toEqual(KEYS);
  });

  it('answers a hidden policy as not found on the reading page and over MCP', async () => {
    const hidden = await stack.apiAs(emp.B, 'POST', `/data/${POLICY}/${pol.A}/page`, {});
    expect(hidden.status).toBe(404);
    expect(((await hidden.json()) as Row).code).toBe('RECORD_NOT_FOUND');
    expect((await stack.apiAs(emp.B, 'POST', `/data/${POLICY}/${pol.B}/page`, {})).status).toBe(200);

    const got = await mcp(emp.B, 'get_record', { objectName: POLICY, recordId: pol.A });
    expect(got.isError).toBe(true);
    expect((got.data.error as Row).code).toBe('RECORD_NOT_FOUND');
    const own = await mcp(emp.B, 'get_record', { objectName: POLICY, recordId: pol.B });
    expect(own.isError).toBe(false);

    const listed = await mcp(emp.B, 'query_records', { objectName: POLICY, fields: ['id', 'owning_unit'], limit: 50 });
    const units = new Set((listed.data.records as Row[]).map((r) => idOf(r.owning_unit)));
    expect([...units].sort()).toEqual([unit.G, unit.B].sort());
  });

  it("does not name a hidden policy through an opinion's 相关制度", async () => {
    // An employee cannot set 相关制度 (a triage field); the administrator links
    // the employee's opinion to a policy the employee cannot see.
    const res = await stack.apiAs(emp.B, 'POST', `/data/${SUGGESTION}`, { policy: pol.B, finding: '与甲公司的办法口径不一致？' });
    expect(res.status).toBe(201);
    const id = String(((await res.json()) as Row).id);
    await stack.hooks.run(SUGGESTION, 'update', { id, related_policy: pol.A }, { as: officer });

    const read = await stack.apiAs(emp.B, 'GET', `/data/${SUGGESTION}/${id}?expand=related_policy`);
    expect(read.status).toBe(200);
    const related = ((await read.json()) as { record: Row }).record.related_policy;
    // Never expanded into the hidden policy's fields: at most the bare id.
    expect(related === null || typeof related === 'string').toBe(true);
    expect(JSON.stringify(related)).not.toContain('甲');
    // And following the link answers not found.
    expect((await stack.apiAs(emp.B, 'GET', `/data/${POLICY}/${pol.A}`)).status).toBe(404);

    // An employee cannot file an opinion on a policy they cannot see.
    const blind = await stack.apiAs(emp.B, 'POST', `/data/${SUGGESTION}`, { policy: pol.A, finding: '看不到的制度' });
    expect(blind.status).toBe(400);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const before = await unitRules();
    const out = await reconcile();
    expect(out.created).toEqual([]);
    expect(out.updated).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(out.unchanged).toHaveLength(4);
    const after = await unitRules();
    expect(after.map((r) => [r.id, r.updated_at]).sort()).toEqual(before.map((r) => [r.id, r.updated_at]).sort());
  });

  it('shares a new policy of a unit that already has its rule, with no run', async () => {
    const created = (await stack.hooks.run(
      POLICY,
      'insert',
      { title: '甲公司印章管理办法', owning_unit: unit.A, status: 'published' },
      { as: officer },
    )) as Row;
    const id = String(created.id);
    const sees = async (token: string) => (await stack.apiAs(token, 'GET', `/data/${POLICY}/${id}`)).status === 200;
    expect(await sees(emp.A)).toBe(true);
    expect(await sees(emp.A1)).toBe(true);
    expect(await sees(emp.B)).toBe(false);
    expect(await sees(emp.G)).toBe(false);
    await stack.hooks.run(POLICY, 'delete', { id }, { as: officer });
  });

  it('re-shares a policy whose 所属单位 changes, with no run', async () => {
    await setOwningUnit(pol.B, unit.A1);
    expect(await visible(emp.B)).toEqual(['G']);
    expect(await visible(emp.A1)).toEqual(['G', 'A', 'A1', 'B']);
    expect(await visible(emp.A)).toEqual(['G', 'A']);
    await setOwningUnit(pol.B, unit.B);
    expect(await visible(emp.B)).toEqual(['G', 'B']);
    expect(await visible(emp.A1)).toEqual(['G', 'A', 'A1']);
  });

  it('follows a user who moves to another unit, with no run', async () => {
    const del = await asAdmin('DELETE', `/data/sys_business_unit_member/${membership.B}`);
    expect(del.status, await del.text()).toBe(200);
    membership.B = await joinUnit(emp.B, unit.A);
    expect(await visible(emp.B)).toEqual(['G', 'A']);
    expect(await visible(emp.B, ATTACHMENT, att)).toEqual(['G', 'A']);

    await asAdmin('DELETE', `/data/sys_business_unit_member/${membership.B}`);
    expect(await visible(emp.B)).toEqual([]);
    membership.B = await joinUnit(emp.B, unit.B);
    expect(await visible(emp.B)).toEqual(['G', 'B']);
  });

  it('follows a unit that moves in the tree, with no run', async () => {
    await setParent(unit.A1, unit.B);
    expect(await visible(emp.A1)).toEqual(['G', 'A1', 'B']);
    expect(await visible(emp.A)).toEqual(['G', 'A']);
    await setParent(unit.A1, unit.A);
    expect(await visible(emp.A1)).toEqual(['G', 'A', 'A1']);
  });

  it('removes the rule of a unit that no longer owns a policy, and touches no other rule', async () => {
    // A rule outside the family, which the script must leave alone.
    const foreign = await asAdmin('POST', '/sharing/rules', {
      name: 'brightrule_policy_finance_read',
      label: '财务制度给集团',
      object: POLICY,
      criteria: { category: 'finance' },
      recipientType: 'business_unit',
      recipientId: unit.G,
      accessLevel: 'read',
    });
    expect(foreign.status, await foreign.text()).toBe(201);

    await setOwningUnit(pol.A1, unit.A);
    // Until the run, 甲一's rule matches nothing: 甲一's policy is now 甲's.
    expect(await visible(emp.A1)).toEqual(['G', 'A', 'A1']);
    expect(await visible(emp.A)).toEqual(['G', 'A', 'A1']);

    const out = await reconcile();
    expect(out.removed).toEqual([ruleNameFor(unit.A1)]);
    expect(out.created).toEqual([]);
    expect(out.unchanged).toHaveLength(3);
    expect((await unitRules()).map((r) => r.name).sort()).toEqual([unit.G, unit.A, unit.B].map(ruleNameFor).sort());
    expect((await asAdmin('GET', '/sharing/rules/brightrule_policy_finance_read')).status).toBe(200);
    expect(await visible(emp.A1)).toEqual(['G', 'A', 'A1']);

    const again = await reconcile();
    expect([again.created, again.updated, again.removed]).toEqual([[], [], []]);

    // 甲一 owns a policy again: the next run gives it its rule back.
    await setOwningUnit(pol.A1, unit.A1);
    expect((await reconcile()).created).toEqual([ruleNameFor(unit.A1)]);
    expect(await visible(emp.A)).toEqual(['G', 'A']);
  });

  it('rewrites a rule of the family that was edited by hand', async () => {
    const name = ruleNameFor(unit.B);
    const edit = await asAdmin('POST', '/sharing/rules', {
      name,
      label: '手工改过',
      object: POLICY,
      criteria: { owning_unit: unit.B },
      recipientType: 'business_unit',
      recipientId: unit.G,
      accessLevel: 'edit',
    });
    expect(edit.status).toBe(201);
    expect(await visible(emp.G)).toEqual(['G', 'B']);
    const out = await reconcile();
    expect(out.updated).toEqual([name]);
    expect(await visible(emp.G)).toEqual(['G']);
    expect(await visible(emp.B)).toEqual(['G', 'B']);
  });
});

describe('ruleNameFor', () => {
  it('spells case-sensitive unit ids one-to-one in a rule name', () => {
    expect(ruleNameFor('Qp9q-EI2f')).toBe(`${RULE_PREFIX}_qp9q_0_e_i2f`);
    expect(ruleNameFor('ab_C')).toBe(`${RULE_PREFIX}ab___c`);
    expect(ruleNameFor('abc')).not.toBe(ruleNameFor('aBc'));
    expect(ruleNameFor('a_b')).not.toBe(ruleNameFor('a-b'));
    for (const id of ['Qp9q-EI2fogUWh7d', 'sdu78Ki048W1q4_n', '2fQ0vo5F5hwTYE4f']) {
      expect(ruleNameFor(id)).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
