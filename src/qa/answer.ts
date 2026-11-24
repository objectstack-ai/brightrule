/**
 * Shapes shared by the inquiry answer, and the fallback used when no model
 * can judge the retrieved clauses. Pure — the hook does the retrieval and the
 * permission check.
 *
 * The answer itself is decided by a model reading every retrieved clause
 * (`judge.ts`). Without one (no AI provider configured, an error, a timeout),
 * nothing is presented as an answer: the best-matching current clauses are
 * listed as references and the question goes to a person. Quoting the top hit
 * as the answer was measured wrong on a real policy, with high scores (3 of 12
 * questions on a 25-article policy), so it is not done.
 */

/** A retrieved clause the asker may read, with its retrieval score. */
export interface ClauseCandidate {
  id: string;
  title: string;
  citation: string;
  content: string;
  score: number;
}

export interface ComposedAnswer {
  status: 'answered' | 'open';
  answer: string;
  answer_source: 'ai';
  cited_clause: string | null;
  match_score: number;
  needs_human: boolean;
  other_references: string | null;
}

/**
 * Below this cosine score the best clause shares too little with the question
 * to be quoted as its answer. Measured on the bigram index over 30 paraphrased
 * questions and 5 off-topic ones: every off-topic question scores 0, while a
 * correct best clause scores from 0.038 up, so the cut sits just above zero
 * overlap.
 */
export const MIN_ANSWER_SCORE = 0.03;

/**
 * The cut per retrieval engine — the engines score on different scales. The
 * `vector` value is PROVISIONAL: embedding models put unrelated Chinese text
 * well above 0, so the cut must be measured with the evaluation set against
 * the chosen model before go-live, not carried from one model to another.
 */
export const MIN_ANSWER_SCORE_BY_ADAPTER: Record<'keyword' | 'vector', number> = {
  keyword: MIN_ANSWER_SCORE,
  vector: 0.5,
};

/** How many clauses the fallback lists as references. */
const MAX_REFERENCES = 3;

export const NOT_FOUND_ANSWER =
  '未在现行制度中找到与该问题直接相关的条款。该问题已转归口部门人工答复，答复后会更新在这里。';

export const REFERENCE_INTRO = '未能自动判断答复。以下现行条款可能与问题相关，仅供参考：';
export const REFERENCE_OUTRO = '该问题已转归口部门人工答复，答复后会更新在这里。';

/**
 * The fallback: never an answer, only references for the asker and the person
 * who answers. Clauses below `minScore` are not listed; with none left, the
 * question is reported as not found.
 */
export function composeReferenceAnswer(candidates: ClauseCandidate[], minScore = MIN_ANSWER_SCORE): ComposedAnswer {
  const ranked = [...candidates].sort((a, b) => b.score - a.score).filter((c) => c.score >= minScore);
  const best = ranked[0];
  if (!best) {
    return {
      status: 'open',
      answer: NOT_FOUND_ANSWER,
      answer_source: 'ai',
      cited_clause: null,
      match_score: round2(Math.max(0, ...candidates.map((c) => c.score))),
      needs_human: true,
      other_references: null,
    };
  }
  const listed = ranked.slice(0, MAX_REFERENCES).map((c, i) => `${i + 1}. ${c.citation}：${c.content}`);
  return {
    status: 'open',
    answer: [REFERENCE_INTRO, ...listed, REFERENCE_OUTRO].join('\n'),
    answer_source: 'ai',
    cited_clause: null,
    match_score: round2(best.score),
    needs_human: true,
    other_references: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
