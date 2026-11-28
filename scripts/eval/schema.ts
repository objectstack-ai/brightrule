/**
 * The evaluation set's formats (brightrule#69), Zod first (AGENTS.md rule 1).
 *
 * Three files make an evaluation set, and a set kept outside this public
 * repository (a redacted real corpus, real questions) uses the same three
 * formats — the driver and the grader read them by path:
 *
 * - a **corpus**: units, personas, policies with their bodies and attachments;
 * - a **question set**: questions, each with its persona and what a right
 *   answer must and must not contain;
 * - **run records**: what the driver saw per question (written by the driver,
 *   read by the grader).
 *
 * A policy is named everywhere by its `key`, which the loader writes into
 * `brightrule_policy.policy_no`: a trajectory's record ids are mapped back to
 * keys through that field.
 */
import { z } from 'zod';

// ── Corpus ──────────────────────────────────────────────────────────────────

export const Lang = z.enum(['zh', 'en']);
export type Lang = z.infer<typeof Lang>;

export const Rank = z.enum(['staff', 'manager', 'executive']);
export type Rank = z.infer<typeof Rank>;

/** A business unit (`sys_business_unit`), named by its code. */
export const Unit = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  /** The parent unit's code; absent for the group. */
  parent: z.string().optional(),
  kind: z.enum(['company', 'department']).default('company'),
  /** Units that exist only to crowd the catalog (no persona belongs to them). */
  distractor: z.boolean().default(false),
});
export type Unit = z.infer<typeof Unit>;

/**
 * An employee account the driver signs in as. `unit` absent means the account
 * belongs to no unit (the platform then gives the model no 提问人 block), which
 * is what the 反问 questions on unit-dependent answers need.
 */
export const Persona = z.object({
  id: z.string().regex(/^p-[a-z0-9-]+$/),
  name: z.string().min(1),
  email: z.string().email(),
  unit: z.string().optional(),
  department: z.string().optional(),
  rank: Rank,
  /** How this persona answers a clarifying question about unit or rank. */
  self_description: z.string().min(1),
  lang: Lang.default('zh'),
});
export type Persona = z.infer<typeof Persona>;

export const ArticleIndexEntry = z.object({
  article: z.string(),
  chapter: z.string().nullable(),
  redacted: z.tuple([z.number().int(), z.number().int()]),
});

export const Attachment = z.object({
  label: z.string(),
  title: z.string(),
  sort_no: z.number().int().min(1),
  /** Absent for a blank form people fill in (no text for the AI). */
  body_md: z.string().optional(),
});
export type Attachment = z.infer<typeof Attachment>;

export const PolicyStatus = z.enum(['draft', 'published', 'revising', 'abolished']);

export const CorpusPolicy = z.object({
  /** Stable id; loaded as `policy_no`. */
  key: z.string().regex(/^[A-Z0-9][A-Z0-9-]*$/),
  title: z.string().min(1),
  /** Owning unit's code. */
  unit: z.string(),
  lang: Lang,
  status: PolicyStatus,
  issuance_type: z.enum(['issue', 'forward', 'reference']).default('issue'),
  /** The forwarded / followed policy's key. */
  parent: z.string().optional(),
  doc_no: z.string().optional(),
  issuing_unit: z.string().optional(),
  category: z.string(),
  category_group: z.enum(['governance', 'operations', 'party']),
  policy_level: z.enum(['level_1', 'level_2', 'level_3']).optional(),
  department: z.string().optional(),
  addressees: z.string().optional(),
  issued_date: z.string().optional(),
  effective_date: z.string().optional(),
  summary: z.string().optional(),
  is_trial: z.boolean().default(false),
  /**
   * 限定范围: meant only for the named audience. The app has no row-level rule
   * for it yet (brightrule#70), so every employee can read it today; questions
   * about it test whether the model holds back, and are reported apart.
   */
  restricted_to: z.string().optional(),
  body_md: z.string().min(1),
  article_index: z.array(ArticleIndexEntry),
  attachments: z.array(Attachment).default([]),
  /** Where the policy comes from: the app's dev seed, the hand-written core, or the distractor generator. */
  origin: z.enum(['seed', 'core', 'distractor']),
});
export type CorpusPolicy = z.infer<typeof CorpusPolicy>;

export const Corpus = z.object({
  version: z.string(),
  units: z.array(Unit),
  personas: z.array(Persona),
  policies: z.array(CorpusPolicy),
});
export type Corpus = z.infer<typeof Corpus>;

// ── Question set ────────────────────────────────────────────────────────────

/** 题型 — the ratios are in docs/inquiry-optimization-2026-11-27.md §4.2. */
export const QuestionType = z.enum([
  'direct', // 直接事实
  'paraphrase', // 口语改写 / 同义
  'calculation', // 计算
  'unit_scope', // 单位口径
  'rank_tier', // 职级 / 岗位分档
  'cross_reference', // 跨条、例外、附则、附件、引用另一份
  'no_basis', // 无依据
  'permission', // 权限
  'clarify', // 反问
  'pinned', // 指定制度（资料包）
  'conflict', // 跨制度冲突（单独报告）
]);
export type QuestionType = z.infer<typeof QuestionType>;

export const PermissionKind = z.enum(['peer', 'restricted', 'draft', 'abolished']);

/** One article a right answer cites: the policy's key and 第X条 (or an attachment label). */
export const ArticleRef = z.object({
  policy: z.string(),
  article: z.string(),
});

/**
 * A number a right answer states, written as the text should show it
 * (`600`, `1.2`, `50 万`). `any_of` lists equivalent spellings.
 */
export const KeyValue = z.object({
  value: z.string(),
  any_of: z.array(z.string()).optional(),
});
export type KeyValue = z.infer<typeof KeyValue>;

/**
 * Something a right answer must not contain (判泄露 / 用错制度):
 * - `policy`: the policy's 文号 or display name (所属单位：制度名称) appears;
 * - `text`: the phrase appears (whitespace ignored);
 * - `value`: the number appears (numerically, so 1,000 = 1000), and when
 *   `near` is given only within a few characters of that word.
 * A test checks that no forbidden item fires on the policies that are the
 * right basis, so a forbidden number never collides with a right one.
 */
export const Forbidden = z.object({
  policy: z.string().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
  near: z.string().optional(),
  why: z.string(),
}).refine((f) => f.policy || f.text || f.value, 'name a policy, a text or a value');
export type Forbidden = z.infer<typeof Forbidden>;

export const Question = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: QuestionType,
  permission_kind: PermissionKind.optional(),
  persona: z.string(),
  question: z.string().min(1),
  /** Earlier user turns sent first, their answers not graded (多轮：自报单位后沿用、中途换话题). */
  context_turns: z.array(z.string()).default([]),
  /** 指定制度: the policy the conversation is pinned to (问这份制度). */
  pinned_policy: z.string().optional(),
  question_lang: Lang,
  policy_lang: Lang,
  /** Policies a right answer reads and rests on, most important first. Empty for 无依据. */
  expected_policies: z.array(z.string()).default([]),
  expected_articles: z.array(ArticleRef).default([]),
  key_values: z.array(KeyValue).default([]),
  /** What a right answer says, for the blind judge. */
  answer_points: z.array(z.string()).min(1),
  /** Whether the right first reply is a clarifying question (asked once). */
  should_clarify: z.boolean().default(false),
  /** What the persona says when asked back; defaults to the persona's self_description. */
  clarify_reply: z.string().optional(),
  /** The right answer is 「未找到相关规定」. */
  expect_no_basis: z.boolean().default(false),
  /**
   * For 无依据: words that no published policy on the persona's unit chain
   * contains — a test checks it, so a 「no basis」 label is never wrong.
   */
  absent_terms: z.array(z.string()).default([]),
  forbidden: z.array(Forbidden).default([]),
  /** 问法来源: `written` = written for this set (not taken from real users); `online` = a real (redacted) question. */
  source: z.enum(['written', 'online']),
  note: z.string().optional(),
});
export type Question = z.infer<typeof Question>;

export const QuestionSet = z.object({
  version: z.string(),
  /** The corpus version these questions are written against. */
  corpus: z.string(),
  questions: z.array(Question),
});
export type QuestionSet = z.infer<typeof QuestionSet>;

// ── Run records (driver → grader) ───────────────────────────────────────────

/** One tool call of the trajectory, as the driver saw it. */
export const ToolCall = z.object({
  tool: z.string(),
  args: z.unknown(),
  /** Policy keys whose body this call returned (get_record of brightrule_policy). */
  read_policies: z.array(z.string()).default([]),
  /** Policy keys a catalog query returned (query_records), in order. */
  listed_policies: z.array(z.string()).default([]),
});

export const RunRecord = z.object({
  question: z.string(),
  config: z.string(),
  rep: z.number().int().min(1),
  /** The final answer text the asker saw (after an automatic clarify reply, the second answer). */
  answer: z.string(),
  /** The first reply, when it was a clarifying question. */
  clarify_text: z.string().optional(),
  clarified: z.boolean(),
  tool_calls: z.array(ToolCall),
  latency_ms: z.number(),
  /** The conversation on the environment, to look the run up there (traces, transcript). */
  conversation_id: z.string().optional(),
  /** Summed over the conversation's model calls (context turns included), when the driver could read the traces. */
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  error: z.string().optional(),
  /** Pure-retrieval hits (vector / hybrid routes only): policy key + article, ranked. */
  retrieval: z.array(ArticleRef).optional(),
});
export type RunRecord = z.infer<typeof RunRecord>;
