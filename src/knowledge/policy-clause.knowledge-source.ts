import { KnowledgeSourceSchema, type KnowledgeSource } from '@objectstack/spec/ai';

/**
 * 制度条款知识库 (brightrule#77): one passage per clause of a published policy,
 * body and attachments alike, for `search_knowledge` to locate the clause
 * before the model reads or cites the policy (src/skills/policy-inquiry.skill.ts).
 *
 * - Indexes `brightrule_policy_clause.content`: the derived clause rows that the
 *   clause-sync hooks keep in step with each policy (src/qa/policy-clause.hook.ts).
 *   Each row is already one article, numbered section or table, prefixed with
 *   【单位｜制度名｜附件】章 > 节 > 条, so the split is `whole`.
 * - Only published policies have clause rows; search re-checks every hit against
 *   the caller's own read access (clauses are controlled by their policy), so
 *   unit isolation (brightrule#74) holds.
 * - No `adapter`: the deployment's store (objectstack#38026). The embedder is the
 *   environment's AI setting (`ai.embedder_*`); with none, the source is not
 *   served and the skill falls back to the catalog route.
 * - `clause_hash` lets a search group identical clauses that several units
 *   carry (`groupBy`); `owning_unit` lets it scope by the asker's unit chain.
 *
 * Egress: the first build sends every clause's text to the embedding provider.
 */
export const PolicyClauseKnowledgeSource: KnowledgeSource = KnowledgeSourceSchema.parse({
  name: 'policy_clause',
  label: '制度条款',
  description: '已发布制度正文和附件按条切分的检索单元，前缀带单位、制度名、章节和条号',
  source: {
    kind: 'object',
    object: 'brightrule_policy_clause',
    content: ['content'],
    metadataFields: ['policy', 'owning_unit', 'clause_hash', 'kind', 'title'],
    split: { strategy: 'whole' },
  },
});
