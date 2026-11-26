import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';
import { POLICY_DIAGNOSE_CAPABILITY } from '../capabilities.js';
import { DIAGNOSE_PENDING_MESSAGE } from '../../actions/diagnose-policy.action.js';

type Row = Record<string, unknown>;

const SUGGESTION = 'brightrule_policy_suggestion';
const DIAGNOSE = 'brightrule_policy_diagnose';

// The two permission sets on the REAL engine (booted from source, in-memory
// database, the sample seed), brightrule#48: an employee holds only the
// default 问询人 set; a policy administrator is an employee who was also
// assigned 制度管理员 — not the platform's dev admin.
describe('制度管理员 and 问询人 on the engine', () => {
  let stack: VerifyStack;
  let devAdmin: string;
  let employee: string;
  let officer: string;
  let policy: Row;

  beforeAll(async () => {
    stack = await bootStack(config);
    devAdmin = await stack.signIn();
    employee = await stack.signUp('employee@example.com');
    officer = await stack.signUp('officer@example.com');
    const grant = await stack.apiAs(devAdmin, 'POST', '/data/sys_user_permission_set', {
      user_id: (await stack.contextFor(officer)).userId,
      permission_set: 'brightrule_policy_admin',
    });
    expect(grant.status).toBe(201);
    [policy] = (await stack.rows('brightrule_policy', { title: '差旅费报销管理办法' })) as Row[];
  });

  afterAll(async () => {
    await stack?.stop();
  });

  const json = async (r: Response) => (await r.json()) as Row;

  it('binds 问询人 to every employee, and 制度诊断 only to the administrator', async () => {
    const emp = await stack.contextFor(employee);
    const off = await stack.contextFor(officer);
    expect(emp.permissions).toContain('brightrule_inquirer');
    expect(emp.permissions).not.toContain('brightrule_policy_admin');
    expect(emp.systemPermissions ?? []).not.toContain(POLICY_DIAGNOSE_CAPABILITY);
    expect(off.permissions).toEqual(expect.arrayContaining(['brightrule_inquirer', 'brightrule_policy_admin']));
    expect(off.systemPermissions).toContain(POLICY_DIAGNOSE_CAPABILITY);
  });

  it('lets an employee read policies and attachments', async () => {
    await stack.seed('brightrule_policy_attachment', [{ title: '住宿标准表', label: '附件1', sort_no: 1, policy: policy.id }]);
    expect((await stack.apiAs(employee, 'GET', '/data/brightrule_policy')).status).toBe(200);
    expect((await stack.rows('brightrule_policy', { id: policy.id }, { as: employee })).length).toBe(1);
    expect((await stack.rows('brightrule_policy_attachment', { policy: policy.id }, { as: employee })).length).toBe(1);
  });

  it('lets an employee file a 制度意见 without the triage fields, and see only their own', async () => {
    const forged = await stack.apiAs(employee, 'POST', `/data/${SUGGESTION}`, {
      policy: policy.id,
      finding: '员工自己定类别和状态。',
      category: 'compliance',
      status: 'accepted',
    });
    expect(forged.status).toBe(403);

    const res = await stack.apiAs(employee, 'POST', `/data/${SUGGESTION}`, {
      policy: policy.id,
      article: '第十一条',
      finding: '没写打车费是否含机场往返。',
      suggestion: '写明是否包含。',
    });
    expect(res.status).toBe(201);
    const [stored] = (await stack.rows(SUGGESTION, { finding: '没写打车费是否含机场往返。' })) as Row[];
    expect(stored).toMatchObject({ policy: policy.id, article: '第十一条', suggestion: '写明是否包含。', status: 'triage', source: 'employee' });
    expect(stored.category ?? null).toBeNull();
    expect(stored.category_group ?? null).toBeNull();
    expect(String(stored.suggestion_no)).toMatch(/^YJ-\d{5}$/);

    // Private: the employee lists only this one, not the two seeded opinions.
    const own = (await stack.rows(SUGGESTION, {}, { as: employee })) as Row[];
    expect(own.map((r) => r.id)).toEqual([stored.id]);
    const other = await stack.signUp('colleague@example.com');
    expect((await stack.rows(SUGGESTION, {}, { as: other })) as Row[]).toEqual([]);

    // The employee may reword it, but not triage it.
    const patch = await stack.apiAs(employee, 'PATCH', `/data/${SUGGESTION}/${stored.id}`, { status: 'accepted' });
    expect(patch.status).toBe(403);
    await stack.hooks.run(SUGGESTION, 'update', { id: stored.id, finding: '补充：含高铁站。' }, { as: employee });
    const [edited] = (await stack.rows(SUGGESTION, { id: stored.id })) as Row[];
    expect(edited).toMatchObject({ status: 'triage', finding: '补充：含高铁站。' });

    // The administrator sees it and triages it; 大类 follows 类别.
    const all = (await stack.rows(SUGGESTION, {}, { as: officer })) as Row[];
    expect(all.map((r) => r.id)).toContain(stored.id);
    await stack.hooks.run(
      SUGGESTION,
      'update',
      { id: stored.id, category: 'not_found', category_group: 'defect', severity: 'low', status: 'open' },
      { as: officer },
    );
    const [triaged] = (await stack.rows(SUGGESTION, { id: stored.id })) as Row[];
    expect(triaged).toMatchObject({ category: 'not_found', category_group: 'unmatched', severity: 'low', status: 'open' });
  });

  it('keeps a 制度意见 when its policy is deleted', async () => {
    const [draft] = (await stack.seed('brightrule_policy', [{ title: '临时制度', status: 'draft' }])) as Row[];
    const created = (await stack.hooks.run(
      SUGGESTION,
      'insert',
      { policy: draft.id, finding: '临时制度的意见。' },
      { as: officer },
    )) as Row;
    await stack.hooks.run('brightrule_policy', 'delete', { id: draft.id }, { as: devAdmin });
    const [kept] = (await stack.rows(SUGGESTION, { id: created.id })) as Row[];
    expect(kept).toBeTruthy();
    expect(kept.policy ?? null).toBeNull();
  });

  it('refuses the AI diagnosis to an employee with 403, and answers the administrator', async () => {
    await expect(
      stack.actions.run('brightrule_policy', DIAGNOSE, { as: employee, recordId: String(policy.id) }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', status: 403 });
    const out = (await stack.actions.run('brightrule_policy', DIAGNOSE, { as: officer, recordId: String(policy.id) })) as Row;
    expect(out).toMatchObject({ ok: true, message: DIAGNOSE_PENDING_MESSAGE });
  });

  it('writes nothing when the administrator runs the diagnosis', async () => {
    const before = ((await stack.rows(SUGGESTION, {})) as Row[]).length;
    const writes = await stack.observeWrites(() =>
      stack.actions.run('brightrule_policy', DIAGNOSE, { as: officer, recordId: String(policy.id) }),
    );
    expect(writes.filter((w) => w.object.startsWith('brightrule_'))).toEqual([]);
    expect(((await stack.rows(SUGGESTION, {})) as Row[]).length).toBe(before);
  });

  it('lets the administrator list, create and edit opinions', async () => {
    const list = await stack.apiAs(officer, 'GET', `/data/${SUGGESTION}`);
    expect(list.status).toBe(200);
    expect(((await json(list)).records as Row[]).length).toBeGreaterThanOrEqual(2);

    const created = (await stack.hooks.run(
      SUGGESTION,
      'insert',
      { policy: policy.id, category: 'missing_clause', severity: 'high', finding: '未规定境外出差的标准。' },
      { as: officer },
    )) as Row;
    expect(created).toMatchObject({ status: 'open', source: 'employee', category_group: 'defect' });
    expect(String(created.suggestion_no)).toMatch(/^YJ-\d{5}$/);
    await stack.hooks.run(SUGGESTION, 'update', { id: created.id, status: 'accepted' }, { as: officer });
    const [stored] = (await stack.rows(SUGGESTION, { id: created.id })) as Row[];
    expect(stored.status).toBe('accepted');
  });

  it('serves the 制度意见 menu entry to every employee', async () => {
    const entries = async (token: string) => {
      const app = (await json(await stack.apiAs(token, 'GET', '/meta/app/brightrule_main_app'))).item as Row;
      const ids: string[] = [];
      const walk = (items: unknown) => {
        for (const e of (items as Row[]) ?? []) {
          ids.push(String(e.id));
          walk(e.children);
        }
      };
      walk(app.navigation);
      return ids;
    };
    expect(await entries(officer)).toContain('brightrule_policy_suggestion_nav');
    const own = await entries(employee);
    expect(own).toContain('brightrule_policy_suggestion_nav');
    expect(own).toContain('brightrule_policy_library_nav');
  });

  it("refuses a policy that names itself as its 上级制度, and accepts another one", async () => {
    const [other] = (await stack.rows('brightrule_policy', { title: '考勤与休假管理制度' })) as Row[];
    await expect(
      stack.hooks.run('brightrule_policy', 'update', { id: policy.id, parent_policy: policy.id }, { as: officer }),
    ).rejects.toMatchObject({ code: 'POLICY_PARENT_SELF' });
    const res = await stack.apiAs(officer, 'PATCH', `/data/brightrule_policy/${policy.id}`, { parent_policy: policy.id });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await json(res))).toContain('上级制度不能选本制度自己');

    await stack.hooks.run('brightrule_policy', 'update', { id: policy.id, parent_policy: other.id }, { as: officer });
    const [stored] = (await stack.rows('brightrule_policy', { id: policy.id })) as Row[];
    expect(stored.parent_policy && typeof stored.parent_policy === 'object' ? (stored.parent_policy as Row).id : stored.parent_policy).toBe(other.id);
  });
});
