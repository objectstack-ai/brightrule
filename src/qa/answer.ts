/**
 * Compose an inquiry's answer from retrieved clauses. Pure — the hook does the
 * retrieval and the permission check, this decides what the asker is told.
 *
 * The answer is EXTRACTIVE: it quotes the best-matching current clause and
 * names where it comes from. It never states anything the clause does not
 * say, and when no clause matches well enough it says so and routes the
 * question to a person instead of guessing. A generative model can rewrite the
 * quote into a direct reply later; the citation and the hand-off stay.
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

/** How many runner-up clauses the answer lists as further reading. */
const MAX_OTHER_REFERENCES = 2;

export const NOT_FOUND_ANSWER =
  '未在现行制度中找到与该问题直接相关的条款。该问题已转归口部门人工答复，答复后会更新在这里。';

export function composeAnswer(candidates: ClauseCandidate[], minScore = MIN_ANSWER_SCORE): ComposedAnswer {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < minScore) {
    return {
      status: 'open',
      answer: NOT_FOUND_ANSWER,
      answer_source: 'ai',
      cited_clause: null,
      match_score: round2(best?.score ?? 0),
      needs_human: true,
      other_references: null,
    };
  }
  const others = ranked
    .slice(1)
    .filter((c) => c.score >= minScore)
    .slice(0, MAX_OTHER_REFERENCES)
    .map((c) => `${c.citation}：${c.content}`);
  return {
    status: 'answered',
    answer: `根据${best.citation}：${best.content}`,
    answer_source: 'ai',
    cited_clause: best.id,
    match_score: round2(best.score),
    needs_human: false,
    other_references: others.length > 0 ? others.join('\n') : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
