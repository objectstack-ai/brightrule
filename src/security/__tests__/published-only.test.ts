import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';

type Row = Record<string, unknown>;

const POLICY = 'brightrule_policy';
const ATTACHMENT = 'brightrule_policy_attachment';
const STATUSES = ['draft', 'published', 'revising', 'abolished'] as const;
type Status = (typeof STATUSES)[number];

// 问询人只读已发布制度 (brightrule#70, docs/visibility.md 维度 1) on the REAL
// engine (booted from source, in-memory database, the sample seed): the
// inquirer set's row-level rule hides every policy that is not published, and
// the attachments of a hidden policy with it (master-detail, controlled by
// parent). A 制度管理员 holds the inquirer set too and still reads them all.
describe('问询人 reads published policies only', () => {
  let stack: VerifyStack;
  let devAdmin: string;
  let employee: string;
  let officer: string;
  const policies = {} as Record<Status, Row>;
  const attachments = {} as Record<Status, Row>;

  beforeAll(async () => {
    stack = await bootStack(config);
    devAdmin = await stack.signIn();
    employee = await stack.signUp('reader@example.com');
    officer = await stack.signUp('office@example.com');
    const grant = await stack.apiAs(devAdmin, 'POST', '/data/sys_user_permission_set', {
      user_id: (await stack.contextFor(officer)).userId,
      permission_set: 'brightrule_policy_admin',
    });
    expect(grant.status).toBe(201);
    for (const status of STATUSES) {
      [policies[status]] = (await stack.seed(POLICY, [{ title: `可见性测试制度（${status}）`, status }])) as Row[];
      [attachments[status]] = (await stack.seed(ATTACHMENT, [
        { title: `可见性测试附件（${status}）`, label: '附件1', sort_no: 1, policy: policies[status].id },
      ])) as Row[];
    }
  });

  afterAll(async () => {
    await stack?.stop();
  });

  const ids = (rows: Row[]) => rows.map((r) => r.id);
  const ours = (rows: Row[], of: Record<Status, Row>) => ids(rows).filter((id) => ids(Object.values(of)).includes(id));
  const listed = async (token: string, object: string) => {
    const res = await stack.apiAs(token, 'GET', `/data/${object}?limit=200`);
    expect(res.status).toBe(200);
    return ((await res.json()) as Row).records as Row[];
  };

  it('lists only the published policy to an employee (find)', async () => {
    expect(ours((await stack.rows(POLICY, {}, { as: employee })) as Row[], policies)).toEqual([policies.published.id]);
    expect(ours(await listed(employee, POLICY), policies)).toEqual([policies.published.id]);
    // The rule narrows what an employee reads; it never widens a filter.
    expect((await stack.rows(POLICY, { status: 'draft' }, { as: employee })) as Row[]).toEqual([]);
    // Every policy in the sample seed is published, and stays readable.
    const seeded = (await stack.rows(POLICY, { title: '差旅费报销管理办法' }, { as: employee })) as Row[];
    expect(seeded.length).toBe(1);
  });

  it.each(['draft', 'revising', 'abolished'] as const)('answers 404 for a %s policy read by id (findOne)', async (status) => {
    const res = await stack.apiAs(employee, 'GET', `/data/${POLICY}/${policies[status].id}`);
    expect(res.status).toBe(404);
    expect((await stack.rows(POLICY, { id: policies[status].id }, { as: employee })) as Row[]).toEqual([]);
  });

  it('reads the published policy by id', async () => {
    const res = await stack.apiAs(employee, 'GET', `/data/${POLICY}/${policies.published.id}`);
    expect(res.status).toBe(200);
  });

  it('hides the attachments of a policy the employee cannot read (find and findOne)', async () => {
    expect(ours((await stack.rows(ATTACHMENT, {}, { as: employee })) as Row[], attachments)).toEqual([
      attachments.published.id,
    ]);
    expect(ours(await listed(employee, ATTACHMENT), attachments)).toEqual([attachments.published.id]);
    for (const status of ['draft', 'revising', 'abolished'] as const) {
      expect((await stack.rows(ATTACHMENT, { policy: policies[status].id }, { as: employee })) as Row[]).toEqual([]);
      expect((await stack.apiAs(employee, 'GET', `/data/${ATTACHMENT}/${attachments[status].id}`)).status).toBe(404);
    }
    expect((await stack.apiAs(employee, 'GET', `/data/${ATTACHMENT}/${attachments.published.id}`)).status).toBe(200);
  });

  it('hides a policy again when it leaves 已发布, and shows it when it is published', async () => {
    const [p] = (await stack.seed(POLICY, [{ title: '可见性测试制度（状态变化）', status: 'published' }])) as Row[];
    const seen = async () => ((await stack.rows(POLICY, { id: p.id }, { as: employee })) as Row[]).length;
    expect(await seen()).toBe(1);
    await stack.hooks.run(POLICY, 'update', { id: p.id, status: 'abolished' }, { as: officer });
    expect(await seen()).toBe(0);
    await stack.hooks.run(POLICY, 'update', { id: p.id, status: 'published' }, { as: officer });
    expect(await seen()).toBe(1);
  });

  it('lets a 制度管理员 (who also holds 问询人) read every policy and attachment', async () => {
    const off = await stack.contextFor(officer);
    expect(off.permissions).toEqual(expect.arrayContaining(['brightrule_inquirer', 'brightrule_policy_admin']));
    expect(ours((await stack.rows(POLICY, {}, { as: officer })) as Row[], policies).sort()).toEqual(
      ids(Object.values(policies)).sort(),
    );
    expect(ours(await listed(officer, POLICY), policies).sort()).toEqual(ids(Object.values(policies)).sort());
    expect(ours((await stack.rows(ATTACHMENT, {}, { as: officer })) as Row[], attachments).sort()).toEqual(
      ids(Object.values(attachments)).sort(),
    );
    for (const status of STATUSES) {
      expect((await stack.apiAs(officer, 'GET', `/data/${POLICY}/${policies[status].id}`)).status).toBe(200);
      expect((await stack.apiAs(officer, 'GET', `/data/${ATTACHMENT}/${attachments[status].id}`)).status).toBe(200);
    }
  });

  it("narrows the platform's own admin too: its View All does not pass the rule, 制度管理员 does", async () => {
    // The platform admin holds 问询人 like everyone (isDefault), and on a
    // public_read object its wildcard View All does not skip row-level rules.
    expect(ours((await stack.rows(POLICY, {}, { as: devAdmin })) as Row[], policies)).toEqual([policies.published.id]);
  });

  it('lets a 制度管理员 edit a draft and add an attachment to it', async () => {
    const res = await stack.apiAs(officer, 'PATCH', `/data/${POLICY}/${policies.draft.id}`, { summary: '草稿改一句。' });
    expect(res.status).toBe(200);
    const created = await stack.apiAs(officer, 'POST', `/data/${ATTACHMENT}`, {
      title: '草稿的附件二',
      label: '附件2',
      sort_no: 2,
      policy: policies.draft.id,
    });
    expect(created.status).toBe(201);
  });
});
