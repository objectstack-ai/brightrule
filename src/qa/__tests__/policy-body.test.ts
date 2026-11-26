import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootStack, type VerifyStack } from '@objectstack/verify';
import config from '../../../objectstack.config';

type Row = Record<string, unknown>;

// The path an AI takes to a policy's text, on the REAL engine (booted from
// source, in-memory database, the sample seed): the body is a field of the
// policy itself (brightrule#45), with an index of its articles.
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

  it('serves no version, relation, clause or inquiry object any more', () => {
    const names = (config.objects ?? []).map((o) => (o as { name: string }).name);
    expect(names).not.toContain('brightrule_policy_version');
    expect(names).not.toContain('brightrule_policy_relation');
    // brightrule#19: the AI reads the body itself; there are no clause rows to
    // index and no inquiry records to answer.
    expect(names).not.toContain('brightrule_clause');
    expect(names).not.toContain('brightrule_question');
  });

  it('gives every seeded policy its body, its 文号 and an index of its articles', async () => {
    const policies = (await stack.rows('brightrule_policy', {}, { as })) as Row[];
    expect(policies).toHaveLength(10);
    for (const p of policies) {
      expect(p.status).toBe('published');
      expect(String(p.body_md), String(p.title)).toMatch(/\*\*第.+条\*\*/);
      expect(String(p.doc_no ?? '')).not.toBe('');
      expect((p.article_index as unknown[] | undefined)?.length ?? 0, String(p.title)).toBeGreaterThan(0);
    }
  });
});
