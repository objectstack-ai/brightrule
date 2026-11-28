/**
 * A compact way to write questions: `q(id, type, persona, text, opts)`, with
 * the expected articles named by fact id and resolved against the corpus, so
 * a question never cites an article that is not there.
 */
import { articleResolver } from '../corpus/index.js';
import { Question, type Forbidden, type KeyValue, type Lang, type QuestionType } from '../schema.js';

const resolve = articleResolver();

export interface QOpts {
  /** [policy key, fact id | 第X条 | 附件N] */
  a?: Array<[string, string]>;
  /** Expected policies, when they are not just those of `a` (order: most important first). */
  p?: string[];
  v?: Array<string | KeyValue>;
  pts: string[];
  clarify?: boolean;
  reply?: string;
  noBasis?: boolean;
  absent?: string[];
  forbid?: Forbidden[];
  ctx?: string[];
  pin?: string;
  perm?: Question['permission_kind'];
  qlang?: Lang;
  plang?: Lang;
  note?: string;
}

export function q(id: string, type: QuestionType, persona: string, question: string, o: QOpts): Question {
  const articles = (o.a ?? []).map(([policy, fact]) => ({ policy, article: resolve(policy, fact) }));
  const policies = o.p ?? [...new Set(articles.map((x) => x.policy))];
  return Question.parse({
    id,
    type,
    ...(o.perm ? { permission_kind: o.perm } : {}),
    persona,
    question,
    context_turns: o.ctx ?? [],
    ...(o.pin ? { pinned_policy: o.pin } : {}),
    question_lang: o.qlang ?? 'zh',
    policy_lang: o.plang ?? 'zh',
    expected_policies: policies,
    expected_articles: articles,
    key_values: (o.v ?? []).map((v) => (typeof v === 'string' ? { value: v } : v)),
    answer_points: o.pts,
    should_clarify: o.clarify ?? false,
    ...(o.reply ? { clarify_reply: o.reply } : {}),
    expect_no_basis: o.noBasis ?? false,
    absent_terms: o.absent ?? [],
    forbidden: o.forbid ?? [],
    source: 'written',
    ...(o.note ? { note: o.note } : {}),
  });
}

/** A forbidden number, optionally only near a word. */
export const fv = (value: string, why: string, near?: string): Forbidden => ({ value, why, ...(near ? { near } : {}) });
