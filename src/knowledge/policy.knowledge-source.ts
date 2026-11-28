import { KnowledgeSourceSchema, type KnowledgeSource } from '@objectstack/spec/ai';

/**
 * 制度正文知识库 (brightrule#77): published policies, one passage per article,
 * for `search_knowledge` to locate 「which policy, which articles」 before the
 * model reads the whole policy (src/skills/policy-inquiry.skill.ts).
 *
 * - Indexes `search_text`, the body with each 「第X条」 as a heading and the
 *   policy's 《所属单位：制度名称》文号 as the top heading (see the field), so
 *   the `markdown` split gives one passage per article that names its policy.
 * - Published only (`where`); a policy that is abolished or back in draft
 *   leaves the index on its next change. Search re-checks every hit against
 *   the caller's own read access, so unit isolation (brightrule#74) holds.
 * - No `adapter`: the deployment's store (objectstack#38026). The embedder is
 *   the environment's AI setting (`ai.embedder_*`); with none, the source is
 *   not served and the skill falls back to the catalog route.
 * - `owning_unit` and `policy_no` are kept with each passage, so a search can
 *   group its hits by policy (`groupBy`).
 *
 * Egress: the first build sends every published policy's search text to the
 * embedding provider.
 */
export const PolicyKnowledgeSource: KnowledgeSource = KnowledgeSourceSchema.parse({
  name: 'policy_text',
  label: '制度正文',
  description: '已发布制度的正文，按条切分；每段带制度名称（所属单位：制度名称）和文号',
  source: {
    kind: 'object',
    object: 'brightrule_policy',
    content: ['search_text'],
    metadataFields: ['owning_unit', 'policy_no', 'category_group'],
    where: { status: 'published' },
    split: { strategy: 'markdown', maxChars: 1200, minChars: 120 },
  },
});
