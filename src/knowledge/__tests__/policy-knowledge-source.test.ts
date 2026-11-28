import { describe, expect, it } from 'vitest';
import config from '../../../objectstack.config';
import { PolicyKnowledgeSource } from '../policy.knowledge-source.js';
import { PolicyInquirySkill } from '../../skills/policy-inquiry.skill.js';

// brightrule#77 — the policy-text knowledge source and what it indexes.
describe('the policy-text knowledge source', () => {
  it('indexes the search text of published policies, one passage per heading, on the deployment store', () => {
    const src = PolicyKnowledgeSource.source as { object: string; content: string[]; where: unknown; split: { strategy: string } };
    expect(src.object).toBe('brightrule_policy');
    expect(src.content).toEqual(['search_text']);
    expect(src.where).toEqual({ status: 'published' });
    expect(src.split.strategy).toBe('markdown');
    expect((PolicyKnowledgeSource as { adapter?: string }).adapter).toBeUndefined();
  });

  it('is wired into the stack', () => {
    const names = ((config as { knowledgeSources?: { name: string }[] }).knowledgeSources ?? []).map((s) => s.name);
    expect(names).toContain('policy_text');
  });
});

describe('the skill on locating a policy', () => {
  const skill = PolicyInquirySkill as { tools?: string[]; instructions?: string };
  it('may call search_knowledge, and still reads whole policies with the data tools', () => {
    expect(skill.tools).toEqual(expect.arrayContaining(['search_knowledge', 'query_records', 'get_record']));
  });
  it('searches first, reads the whole policy, and falls back to the catalog', () => {
    expect(skill.instructions).toContain('有 search_knowledge 时先用它定位');
    expect(skill.instructions).toContain('读整份正文再作答');
    expect(skill.instructions).toContain('改查目录');
  });
});
