import type { ClauseCandidate, ComposedAnswer } from './answer.js';
import { NOT_FOUND_ANSWER } from './answer.js';

/** The two message roles this module sends (a subset of the AI SDK's `ModelMessage`). */
export interface JudgeMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * The part of the platform's `ai` service (`IAIService` in
 * `@objectstack/spec/contracts`) this module calls. Declared locally so the
 * app does not depend on the AI SDK's message types.
 */
export interface ChatService {
  chat(messages: JudgeMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<{ content: string }>;
}

/**
 * Decide the answer to an inquiry from the retrieved clauses, with a model.
 *
 * Retrieval ranks; it does not answer. On a real policy, words like 接待 or
 * 宴请 sit in many clauses, so the best-scoring clause is often not the one
 * that answers (measured on a 25-article policy: the top hit was wrong for 3
 * of 12 questions, each above the quoting threshold). The model reads every
 * candidate the asker may see and says which ones answer, or that none does.
 *
 * Grounding is enforced here, not trusted: a judgement may only cite the
 * candidates it was shown, and anything that does not parse is discarded so
 * the caller falls back to listing references for a person.
 *
 * The output is asked for as plain JSON in the text, not through a structured
 * output mode: OpenAI-compatible providers such as DeepSeek reject the
 * `json_schema` response format.
 */

/** Candidates handed to the model. */
export const JUDGE_TOP_K = 8;
/** The save waits for the model at most this long, then falls back. */
export const JUDGE_TIMEOUT_MS = 30_000;
export const DISCLAIMER = '以正式发布的制度文本为准。';

export type Verdict = 'answered' | 'partial' | 'no_basis';

export interface Judgement {
  verdict: Verdict;
  answer: string;
  /** Candidate ids (not labels), each one of the candidates shown. */
  cited: string[];
}

const VERDICTS: readonly Verdict[] = ['answered', 'partial', 'no_basis'];

const label = (i: number) => `C${i + 1}`;

export function buildJudgeMessages(question: string, candidates: ClauseCandidate[]): JudgeMessage[] {
  const system = [
    '你是公司的制度问询助手。下面给出员工的问题，以及检索到的若干条现行制度条款（编号 C1、C2……）。只依据这些条款作答。',
    '',
    '规则：',
    '1. 先判断哪些条款能回答问题。只是主题相近、不能回答问题的条款不要引用。',
    '2. 能回答时：第一句给结论；每个结论后标出处，用条款的「出处」原文；需要计算时写出算式。答复中的每个数字、金额、天数、条件都必须能在所引条款原文中找到，或由其算出。条文可以有不同理解时，说明需归口部门确认。',
    '3. 条款只写了「参照某文件执行」或只回答了问题的一部分，而缺少的依据不在给出的条款中：verdict 填 partial，在 answer 里讲清已知的部分和缺少的依据。',
    '4. 给出的条款都不能回答问题：verdict 填 no_basis，answer 用一句话说明现行条款中没有找到相关规定。不要猜，不要用常识或其他制度补充。',
    '5. 不提供法律意见；涉及个人具体情况的，说明制度规定，并请员工找归口部门确认。',
    '',
    '只输出一个 JSON 对象，不要输出其他文字：',
    '{"verdict": "answered" | "partial" | "no_basis", "answer": "给员工的答复", "cited": ["C1"]}',
    'cited 只能填上面给出的编号，列出答复实际依据的条款。',
  ].join('\n');
  const clauses = candidates
    .map((c, i) => `${label(i)}\n出处：${c.citation}\n原文：${c.content}`)
    .join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `问题：${question}\n\n条款：\n\n${clauses}` },
  ];
}

/** Parse the model's text; `null` when it is not a usable judgement. */
export function parseJudgement(text: string, candidates: ClauseCandidate[]): Judgement | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { verdict, answer, cited } = raw as Record<string, unknown>;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as Verdict)) return null;
  if (typeof answer !== 'string' || answer.trim() === '') return null;
  const labels = Array.isArray(cited) ? cited.map((c) => String(c).trim().toUpperCase()) : [];
  const ids: string[] = [];
  for (const l of labels) {
    const m = /^C(\d+)$/.exec(l);
    const candidate = m ? candidates[Number(m[1]) - 1] : undefined;
    if (!candidate) return null; // a citation outside what it was shown
    if (!ids.includes(candidate.id)) ids.push(candidate.id);
  }
  if (verdict !== 'no_basis' && ids.length === 0) return null; // an answer must rest on a clause
  return { verdict: verdict as Verdict, answer: answer.trim(), cited: verdict === 'no_basis' ? [] : ids };
}

export function composeJudgedAnswer(j: Judgement, candidates: ClauseCandidate[]): ComposedAnswer {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const cited = j.cited.map((id) => byId.get(id)!).filter(Boolean);
  const bestScore = Math.max(0, ...candidates.map((c) => c.score));
  if (j.verdict === 'no_basis') {
    return {
      status: 'open',
      answer: NOT_FOUND_ANSWER,
      answer_source: 'ai',
      cited_clause: null,
      match_score: round2(bestScore),
      needs_human: true,
      other_references: null,
    };
  }
  const body = j.answer.includes(DISCLAIMER) ? j.answer : `${j.answer}\n\n${DISCLAIMER}`;
  const others = cited.slice(1).map((c) => `${c.citation}：${c.content}`);
  return {
    status: j.verdict === 'answered' ? 'answered' : 'open',
    answer: j.verdict === 'answered' ? body : `${body}\n\n该问题已同时转归口部门人工确认。`,
    answer_source: 'ai',
    cited_clause: cited[0].id,
    match_score: round2(cited[0].score),
    needs_human: j.verdict !== 'answered',
    other_references: others.length > 0 ? others.join('\n') : null,
  };
}

/**
 * Ask the model and compose its answer; `null` when it cannot be used (no
 * candidates, an error, a timeout or an unusable reply), so the caller falls
 * back to references for a person.
 */
export async function judgeAnswer(
  ai: ChatService,
  question: string,
  candidates: ClauseCandidate[],
  timeoutMs = JUDGE_TIMEOUT_MS,
): Promise<ComposedAnswer | null> {
  if (candidates.length === 0) return null;
  const shown = candidates.slice(0, JUDGE_TOP_K);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      ai.chat(buildJudgeMessages(question, shown), { temperature: 0, maxTokens: 2048 }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    const judgement = parseJudgement(reply?.content ?? '', shown);
    return judgement ? composeJudgedAnswer(judgement, shown) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
