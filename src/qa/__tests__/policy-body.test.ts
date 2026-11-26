import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';

type Row = Record<string, unknown>;
const refId = (v: unknown) => (v && typeof v === 'object' ? (v as Row).id : v);

// The path an AI takes to a policy's text, on the REAL engine (booted from
// source, in-memory database, the sample seed): the body is a field of the
// policy itself (brightrule#45), and the clause rows follow its status.
describe('a policy holds its own body', () => {
  let stack: VerifyStack;
  let as: string;

  beforeAll(async () => {
    stack = await bootStack(config);
    as = await stack.signIn();
  });

  afterAll(async () => {
    await stack?.stop();
  });

  it('serves no version or relation object any more', () => {
    const names = (config.objects ?? []).map((o) => (o as { name: string }).name);
    expect(names).not.toContain('brightrule_policy_version');
    expect(names).not.toContain('brightrule_policy_relation');
  });

  it('gives every seeded policy its body, its 文号 and current clauses', async () => {
    const policies = (await stack.rows('brightrule_policy', {}, { as })) as Row[];
    const clauses = (await stack.rows('brightrule_clause', {}, { as })) as Row[];
    expect(policies).toHaveLength(5);
    for (const p of policies) {
      expect(p.status).toBe('published');
      expect(String(p.body_md), String(p.title)).toMatch(/\*\*第.+条\*\*/);
      expect(String(p.doc_no ?? '')).not.toBe('');
      const own = clauses.filter((c) => refId(c.policy) === p.id);
      expect(own.length, String(p.title)).toBeGreaterThan(0);
      expect(own.every((c) => c.is_current === true)).toBe(true);
    }
  });

  it("retires a policy's clauses when it leaves published, and restores them when it returns", async () => {
    const [policy] = (await stack.rows('brightrule_policy', { title: '合同管理办法' }, { as })) as Row[];
    const current = async () =>
      ((await stack.rows('brightrule_clause', { policy: policy.id }, { as })) as Row[]).map((c) => c.is_current);

    await stack.hooks.run('brightrule_policy', 'update', { id: policy.id, status: 'abolished' }, { as });
    expect(await current()).toEqual([false]);
    await stack.hooks.run('brightrule_policy', 'update', { id: policy.id, status: 'published' }, { as });
    expect(await current()).toEqual([true]);
  });

  it('files a new clause as current only under a published policy', async () => {
    const draft = (await stack.hooks.run(
      'brightrule_policy',
      'insert',
      { title: '示例草稿制度', status: 'draft', body_md: '# 示例草稿制度\n\n**第一条** 测试\n' },
      { as },
    )) as Row;
    const clause = (await stack.hooks.run(
      'brightrule_clause',
      'insert',
      { title: '示例草稿制度 第一条', policy: draft.id, content: '测试', is_current: true },
      { as },
    )) as Row;
    expect(clause.is_current).toBe(false);
    await stack.hooks.run('brightrule_policy', 'update', { id: draft.id, status: 'published' }, { as });
    const [stored] = (await stack.rows('brightrule_clause', { id: clause.id }, { as })) as Row[];
    expect(stored.is_current).toBe(true);
  });
});
