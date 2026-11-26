import { KnowledgeServicePlugin } from '@objectstack/service-knowledge';
import { KeywordKnowledgePlugin } from './keyword-adapter.js';
import { policyClauseKnowledgeSource, policyQaAdapter } from './knowledge-source.js';
import { PolicyQaPlugin } from './policy-qa-plugin.js';
import { ANSWER_QUESTION_FUNCTION, answerQuestion, QuestionAnswerHook } from './question-answer.hook.js';
import { QuestionGuardHook } from './question-guard.hook.js';
import { QuestionScopeHook } from './question-scope.hook.js';
import { ClauseCurrentHook, PolicyStatusHook } from './policy-status.hook.js';
import { KnowledgeVectorPlugin } from './vector/plugin.js';

/**
 * 制度问询 — what the stack needs for AI policy inquiry.
 *
 * Retrieval engine, by environment (see docs/solution.md §07):
 *   - OS_KNOWLEDGE_EMBEDDING_MODEL set → semantic retrieval; the vectors live in
 *     PostgreSQL + pgvector (OS_KNOWLEDGE_VECTOR_STORE=pgvector, production) or
 *     in memory (the default, development);
 *   - unset → keyword retrieval over character bigrams (demos and tests).
 */
export function policyQaPlugins(): unknown[] {
  return [
    new KnowledgeServicePlugin({ sources: [policyClauseKnowledgeSource()] }),
    policyQaAdapter() === 'vector' ? new KnowledgeVectorPlugin() : new KeywordKnowledgePlugin(),
    new PolicyQaPlugin(),
  ];
}

/**
 * Lifecycle hooks: strip a person's forged answer, check the question's scope,
 * then answer it on save (the order is each hook's declared `priority`, not
 * this list's); keep clause currency in step with the policy's status.
 */
export const policyQaHooks = [
  QuestionGuardHook,
  QuestionScopeHook,
  QuestionAnswerHook,
  PolicyStatusHook,
  ClauseCurrentHook,
];

/** Named functions the hooks reference (the stack's `functions` map). */
export const policyQaFunctions = { [ANSWER_QUESTION_FUNCTION]: answerQuestion };
