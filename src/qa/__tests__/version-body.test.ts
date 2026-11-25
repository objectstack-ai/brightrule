import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';

type Row = Record<string, unknown>;
const refId = (v: unknown) => (v && typeof v === 'object' ? (v as Row).id : v);

// The path an AI takes to a policy's text, on the REAL engine (booted from
// source, in-memory database, the sample seed): policy → current_version →
// the version's body. The pointer is not seeded; the version hook sets it.
describe('a policy leads to its current body', () => {
  let stack: VerifyStack;
  let as: string;

  beforeAll(async () => {
    stack = await bootStack(config);
    as = await stack.signIn();
  });

  afterAll(async () => {
    await stack?.stop();
  });

  it('points every seeded policy at its current version, whose body is the text', async () => {
    const policies = (await stack.rows('brightrule_policy', {}, { as })) as Row[];
    const versions = (await stack.rows('brightrule_policy_version', {}, { as })) as Row[];
    expect(policies).toHaveLength(5);
    for (const p of policies) {
      const v = versions.find((x) => x.id === refId(p.current_version));
      expect(v, String(p.title)).toBeDefined();
      expect(v!.version_status).toBe('current');
      expect(refId(v!.policy)).toBe(p.id);
      expect(String(v!.body_md)).toMatch(/\*\*第.+条\*\*/);
    }
  });

  it('moves the pointer when a new version is set current, and clears it when that one is withdrawn', async () => {
    const [policy] = (await stack.rows('brightrule_policy', { title: '合同管理办法' }, { as })) as Row[];
    const old = refId(policy.current_version);
    const next = (await stack.hooks.run(
      'brightrule_policy_version',
      'insert',
      { title: '合同管理办法 V3.0', policy: policy.id, version_no: 'V3.0', version_status: 'current', body_md: '# 合同管理办法（V3.0）\n\n**第一条** 测试\n' },
      { as },
    )) as Row;
    let [after] = (await stack.rows('brightrule_policy', { id: policy.id }, { as })) as Row[];
    expect(refId(after.current_version)).toBe(next.id);
    const [previous] = (await stack.rows('brightrule_policy_version', { id: old }, { as })) as Row[];
    expect(previous.version_status).toBe('superseded');

    await stack.hooks.run('brightrule_policy_version', 'update', { id: next.id, version_status: 'draft' }, { as });
    [after] = (await stack.rows('brightrule_policy', { id: policy.id }, { as })) as Row[];
    expect(after.current_version ?? null).toBeNull();
  });
});
