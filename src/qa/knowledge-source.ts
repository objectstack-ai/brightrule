import { KnowledgeSourceSchema, type KnowledgeSource } from '@objectstack/spec/ai';

/** The knowledge source id every inquiry searches. */
export const POLICY_CLAUSE_SOURCE_ID = 'policy_clauses';

/**
 * Which retrieval engine the clause source binds to:
 *   - `vector`  — semantic retrieval (`src/qa/vector/`), chosen when an
 *                 embedding model is configured (`OS_KNOWLEDGE_EMBEDDING_MODEL`);
 *                 its vectors live where `OS_KNOWLEDGE_VECTOR_STORE` says
 *                 (`pgvector` in production, `memory` in development);
 *   - `keyword` — keyword retrieval over character bigrams, with no model
 *                 (`src/qa/keyword-adapter.ts`), for demos and tests.
 */
export type PolicyQaAdapter = 'vector' | 'keyword';

export function policyQaAdapter(env: Record<string, string | undefined> = process.env): PolicyQaAdapter {
  return env.OS_KNOWLEDGE_EMBEDDING_MODEL?.trim() ? 'vector' : 'keyword';
}

/**
 * 条款知识源 — each `brightrule_clause` row becomes one knowledge document.
 *
 * Content is the clause's citation, title, text and keywords — the citation
 * names the policy, so a question about travel expenses lands on the travel
 * policy rather than on another policy that also mentions reimbursement.
 * `citation` and `is_current` ride along as metadata. The source indexes every
 * clause and the answer path keeps current ones only, rather than a `where`
 * here, because the event-sync path re-indexes a changed row without
 * re-reading the source's `where` — a clause that stops being current would
 * stay searchable.
 */
export function policyClauseKnowledgeSource(adapter: PolicyQaAdapter = policyQaAdapter()): KnowledgeSource {
  return KnowledgeSourceSchema.parse({
    id: POLICY_CLAUSE_SOURCE_ID,
    label: '制度条款',
    description: '现行制度条款，制度问询的检索范围',
    adapter,
    source: {
      kind: 'object',
      object: 'brightrule_clause',
      contentFields: ['citation', 'title', 'content', 'keywords'],
      metadataFields: ['citation', 'is_current'],
    },
  });
}
