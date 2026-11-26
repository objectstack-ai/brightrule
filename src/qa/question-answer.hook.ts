import { defineHook, type HookContext } from '@objectstack/spec/data';
import { composeReferenceAnswer, MIN_ANSWER_SCORE_BY_ADAPTER, type ClauseCandidate } from './answer.js';
import { judgeAnswer, JUDGE_TOP_K } from './judge.js';
import { POLICY_CLAUSE_SOURCE_ID, policyQaAdapter } from './knowledge-source.js';
import { getPolicyAI, getPolicyKnowledge } from './policy-qa-plugin.js';

/** Candidates retrieved per question, before the current / readable cut. */
const RETRIEVE_TOP_K = 12;

/**
 * Answer a new inquiry from the current clauses its asker may read.
 *
 * Runs on `beforeInsert`, so the answer is part of the saved row: the asker
 * sees it the moment the record opens, and no second write is needed. The save
 * waits for the model (`JUDGE_TIMEOUT_MS` at most).
 *
 * Retrieval ranks the clauses; the platform's AI service reads the top
 * `JUDGE_TOP_K` the asker may see and decides the answer, citing only those
 * (`judge.ts`). Without a usable model reply the clauses are listed as
 * references and the question goes to a person (`composeReferenceAnswer`).
 *
 * Two cuts happen after retrieval, both through `ctx.api` — the data API bound
 * to the asker's own context:
 *   - permission: a clause the asker cannot read is never quoted, whatever it
 *     scored;
 *   - currency: only `is_current` clauses answer, so the text of a policy that
 *     is not published never reaches an employee.
 * Retrieval itself runs elevated (it ranks; it does not disclose), and the
 * read-back is what decides what may be disclosed.
 *
 * An inquiry saved with an answer already (a person answering, an import) is
 * left as written.
 *
 * The handler needs the knowledge service and module helpers, so it cannot be
 * lowered to a metadata-only body. It is registered in the stack's
 * `functions` map and the hook names it, which declares the bundling as
 * intended (`os explain hook-body/not-lowerable`).
 */
export const ANSWER_QUESTION_FUNCTION = 'brightrule_answer_question';

export const QuestionAnswerHook = defineHook({
  name: 'brightrule_question_answer',
  object: 'brightrule_question',
  events: ['beforeInsert'],
  handler: ANSWER_QUESTION_FUNCTION,
});

export async function answerQuestion(ctx: HookContext): Promise<void> {
  const data = (ctx.input as { data?: Record<string, unknown> }).data;
  const question = typeof data?.question === 'string' ? data.question.trim() : '';
  if (!data || !question || data.answer) return;
  const knowledge = getPolicyKnowledge();
  if (!knowledge || !ctx.api) return;

  const hits = await knowledge.search(question, {
    sourceIds: [POLICY_CLAUSE_SOURCE_ID],
    topK: RETRIEVE_TOP_K,
    executionContext: { isSystem: true, positions: [], permissions: [], systemPermissions: [] } as never,
  });
  const scoreById = new Map<string, number>();
  for (const hit of hits) {
    if (hit.sourceRecordId && !scoreById.has(hit.sourceRecordId)) scoreById.set(hit.sourceRecordId, hit.score);
  }

  const readable = scoreById.size === 0
    ? []
    : ((await ctx.api.object('brightrule_clause').find({
        where: { id: { $in: [...scoreById.keys()] }, is_current: true },
        fields: ['id', 'title', 'citation', 'content'],
      })) as Array<Record<string, unknown>>);

  const candidates: ClauseCandidate[] = readable.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    citation: String(row.citation || row.title || ''),
    content: String(row.content ?? ''),
    score: scoreById.get(String(row.id)) ?? 0,
  }));

  candidates.sort((a, b) => b.score - a.score);
  const ai = getPolicyAI();
  const judged = ai ? await judgeAnswer(ai, question, candidates.slice(0, JUDGE_TOP_K)) : null;
  Object.assign(data, judged ?? composeReferenceAnswer(candidates, MIN_ANSWER_SCORE_BY_ADAPTER[policyQaAdapter()]));
}
