/**
 * Rule grading (brightrule#69 §5): pure functions over an answer's text and
 * the corpus — numbers, article numbers, policy ids, verbatim quotes, leaks,
 * refusals, clarifying questions, answer language. The blind model judge
 * (judge.ts) covers what rules cannot: whether the answer points are made.
 */
import type { CorpusPolicy, Forbidden, KeyValue, Lang, Question, RunRecord } from '../schema.js';

// ── Text normalisation ──────────────────────────────────────────────────────

/** For substring checks: no whitespace, no Markdown emphasis / headings, lower case. */
export function squash(s: string): string {
  return s.replace(/\*\*|__|`|^#+/gm, '').replace(/\s+/g, '').toLowerCase();
}

// ── Numbers ─────────────────────────────────────────────────────────────────

const ZH_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 十二 → 12, 二十 → 20, 三百五十 → 350, 一千二百 → 1200; NaN when it is not a numeral. */
export function zhToNumber(s: string): number {
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of s) {
    if (ch in ZH_DIGITS) digit = ZH_DIGITS[ch];
    else if (ch === '十' || ch === '百' || ch === '千') {
      const unit = ch === '十' ? 10 : ch === '百' ? 100 : 1000;
      section += (digit || 1) * unit;
      digit = 0;
    } else if (ch === '万') {
      total += (section + digit) * 10000;
      section = 0;
      digit = 0;
    } else return Number.NaN;
  }
  return total + section + digit;
}

export interface NumberHit {
  n: number;
  index: number;
  end: number;
}

const MULT: Record<string, number> = { 万: 1e4, 亿: 1e8, 千: 1e3, k: 1e3, thousand: 1e3, million: 1e6 };
const ARABIC = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s*(?:万|亿|千|k\b|thousand\b|million\b))?/gi;
// A Chinese numeral counts only before a unit word, and never in 第X条 / 第X章.
const ZH_NUM = /(?<![第零一二两三四五六七八九十百千万])([零一二两三四五六七八九十百千万]+)(?=[天个年次条元小时日周月位名人倍岁%分])/g;

/** Every number in `text`, with 万 / thousand / million applied and Chinese numerals before a unit read. */
export function extractNumbers(text: string): NumberHit[] {
  const hits: NumberHit[] = [];
  for (const m of text.matchAll(ARABIC)) {
    const base = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
    const mult = m[3] ? MULT[m[3].trim().toLowerCase()] ?? 1 : 1;
    hits.push({ n: base * mult, index: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(ZH_NUM)) {
    const n = zhToNumber(m[1]);
    if (!Number.isNaN(n) && m[1] !== '万') hits.push({ n, index: m.index!, end: m.index! + m[1].length });
  }
  return hits;
}

/** A key value is numeric when it is a number with an optional 万 / % / thousand-type multiplier. */
export function numericValue(v: string): number | null {
  const m = v.trim().match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(万|亿|千|k|thousand|million|%)?$/i);
  if (!m) return null;
  const base = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
  const suffix = m[3]?.toLowerCase();
  return suffix && suffix !== '%' ? base * (MULT[suffix] ?? 1) : base;
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));

/** Whether the answer states the key value (numerically for numbers, as a phrase otherwise). */
export function hasKeyValue(answer: string, kv: KeyValue): boolean {
  const spellings = [kv.value, ...(kv.any_of ?? [])];
  const nums = extractNumbers(answer);
  const flat = squash(answer);
  return spellings.some((s) => {
    const n = numericValue(s);
    return n !== null ? nums.some((h) => sameNumber(h.n, n)) : flat.includes(squash(s));
  });
}

// ── Articles and policies ───────────────────────────────────────────────────

/**
 * An article or attachment reference as a language-free key: 第十五条 and
 * Article 15 → `a15`; 附件1 / 附表1 / Appendix 1 → `x1`.
 */
export function articleKey(ref: string): string | null {
  const zh = ref.match(/第([零一二两三四五六七八九十百\d]+)条/);
  if (zh) return `a${/^\d+$/.test(zh[1]) ? Number(zh[1]) : zhToNumber(zh[1])}`;
  const en = ref.match(/\b(?:Article|Art\.)\s*(\d+)/i);
  if (en) return `a${Number(en[1])}`;
  const att = ref.match(/(?:附件|附表|Appendix|Attachment|Annex)\s*(\d+)/i);
  if (att) return `x${Number(att[1])}`;
  return null;
}

/** Every article / attachment key the answer cites. */
export function citedArticles(answer: string): Set<string> {
  const out = new Set<string>();
  const re = /第[零一二两三四五六七八九十百\d]+条|\b(?:Article|Art\.)\s*\d+|(?:附件|附表|Appendix|Attachment|Annex)\s*\d+/gi;
  for (const m of answer.matchAll(re)) {
    const k = articleKey(m[0]);
    if (k) out.add(k);
  }
  return out;
}

/** Whether the answer names the policy: its 文号, its display name, or its title when no other core policy shares it. */
export function citesPolicy(answer: string, policy: CorpusPolicy, unitName: string, titleIsUnique: boolean): boolean {
  const flat = squash(answer);
  if (policy.doc_no && flat.includes(squash(policy.doc_no))) return true;
  if (flat.includes(squash(`${unitName}：${policy.title}`)) || flat.includes(squash(`${unitName}:${policy.title}`))) return true;
  return titleIsUnique && flat.includes(squash(policy.title));
}

// ── Quotes ──────────────────────────────────────────────────────────────────

const QUOTE_RE = /「([^」]+)」|“([^”]+)”|『([^』]+)』|"([^"\n]+)"/g;

/** The quoted passages of an answer that are long enough to check (≥ 6 characters after squashing). */
export function extractQuotes(answer: string): string[] {
  const out: string[] = [];
  for (const m of answer.matchAll(QUOTE_RE)) {
    const q = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (squash(q).length >= 6) out.push(q);
  }
  return out;
}

/**
 * Whether a quote appears verbatim in one of the sources (whitespace and
 * Markdown emphasis ignored). An excerpt with an ellipsis passes when every
 * piece of four or more characters does.
 */
export function quoteIsVerbatim(quote: string, sources: string[]): boolean {
  const pieces = quote.split(/……|…|\.\.\./).map(squash).filter((p) => p.length >= 4);
  if (pieces.length === 0) return true;
  const hay = sources.map(squash);
  return pieces.every((p) => hay.some((h) => h.includes(p)));
}

/** The text a policy answers from: its body and its attachments' text. */
export const policyTexts = (p: CorpusPolicy): string[] => [p.body_md, ...p.attachments.flatMap((a) => (a.body_md ? [a.body_md] : []))];

// ── Leaks ───────────────────────────────────────────────────────────────────

const NEAR_WINDOW = 12;

/** Whether one forbidden item fires on `text`. `policyOf` resolves a policy key for the `policy` form. */
export function forbiddenFires(
  text: string,
  f: Forbidden,
  policyOf: (key: string) => { policy: CorpusPolicy; unitName: string } | undefined,
): boolean {
  if (f.text && squash(text).includes(squash(f.text))) return true;
  if (f.value) {
    const want = numericValue(f.value);
    if (want === null) {
      if (squash(text).includes(squash(f.value))) return true;
    } else {
      for (const h of extractNumbers(text)) {
        if (!sameNumber(h.n, want)) continue;
        if (!f.near) return true;
        const around = text.slice(Math.max(0, h.index - NEAR_WINDOW), h.end + NEAR_WINDOW).toLowerCase();
        if (around.includes(f.near.toLowerCase())) return true;
      }
    }
  }
  if (f.policy) {
    const p = policyOf(f.policy);
    if (p && citesPolicy(text, p.policy, p.unitName, false)) return true;
  }
  return false;
}

// ── Refusal, clarification, language ────────────────────────────────────────

const REFUSAL_ZH = /未能?找到|没有找到|未查到|没有查到|没有(?:相关|具体|明确)的?(?:规定|条款|内容)|未作(?:出)?(?:相关)?规定|无相关规定|没有规定|暂无(?:相关)?规定|并未规定|未涉及|不能(?:向您)?(?:提供|披露)|无权(?:查看|查阅)/;
const REFUSAL_EN = /(?:could not|couldn't|did not|didn't|cannot|can't|was unable to|unable to) find|no (?:policy|provision|rule|article)s?\b[^.]{0,40}\b(?:covers?|covering|addresses|on|about|for)|(?:is|are) not (?:covered|addressed|specified)|does(?: not|n't) (?:cover|address|specify|mention)|there (?:is|are) no (?:policy|provision|rule)|not able to (?:share|disclose)|cannot (?:share|disclose)/i;

/** Whether the answer says there is no basis (未找到相关规定 / no policy covers this). */
export function looksLikeRefusal(answer: string): boolean {
  return REFUSAL_ZH.test(answer) || REFUSAL_EN.test(answer);
}

/** Whether a reply asks the asker something back (unit, rank, …) and waits for it. */
export function looksLikeClarifyingQuestion(reply: string): boolean {
  const tail = reply.trim().slice(-160);
  if (!/[？?]/.test(tail)) return false;
  return /请问|请告诉|告诉我|您在哪|您是|哪家|哪个单位|哪一?档|职级|岗位|多大|哪一年|合同期限|which|what (?:is your|grade|company)|are you|could you (?:tell|confirm|let)|let me know|please (?:tell|confirm)/i.test(tail);
}

/** The language an answer is written in: Chinese when CJK characters outweigh Latin words. */
export function detectLang(text: string): Lang {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return cjk >= latin / 4 ? 'zh' : 'en';
}

// ── Location (定位层) ───────────────────────────────────────────────────────

export interface Location {
  recall1: number;
  recall3: number;
  rr: number;
}

/** Policy-level recall@1 / @3 and reciprocal rank over the policies the trajectory actually read, in order. */
export function locationMetrics(expected: string[], reads: string[]): Location | null {
  if (expected.length === 0) return null;
  const order = [...new Set(reads)];
  const want = new Set(expected);
  const recallAt = (k: number) => order.slice(0, k).filter((r) => want.has(r)).length / want.size;
  const first = order.findIndex((r) => want.has(r));
  return { recall1: recallAt(1), recall3: recallAt(3), rr: first < 0 ? 0 : 1 / (first + 1) };
}

/** Article-level recall@k of a pure retrieval list (vector / hybrid routes). */
export function retrievalRecall(expected: Array<{ policy: string; article: string }>, hits: Array<{ policy: string; article: string }>, k: number): number | null {
  if (expected.length === 0) return null;
  const key = (r: { policy: string; article: string }) => `${r.policy}#${articleKey(r.article) ?? r.article}`;
  const top = new Set(hits.slice(0, k).map(key));
  return expected.filter((e) => top.has(key(e))).length / expected.length;
}

// ── One record ──────────────────────────────────────────────────────────────

export interface CorpusIndex {
  policy(key: string): CorpusPolicy | undefined;
  unitName(code: string): string;
  titleIsUnique(title: string): boolean;
}

export interface RuleResult {
  question: string;
  config: string;
  rep: number;
  keyValues: { hit: number; total: number; missing: string[] };
  articles: { hit: number; total: number };
  policiesCited: { hit: number; total: number };
  quotes: { total: number; verified: number; checked: number };
  /** Numbers of the conclusion found in a quote (null: nothing to check, or a calculation). */
  conclusionQuoted: boolean | null;
  leaks: string[];
  refused: boolean;
  clarified: boolean;
  langMatch: boolean;
  location: Location | null;
  retrieval5: number | null;
  retrieval10: number | null;
  /** A no-basis question answered anyway, or a quote in the policy's language that is not in any read policy. */
  fabricated: boolean;
  /** 2 / 1 / 0 from rules alone; null when the question has no rule-checkable value (the judge decides). */
  ruleScore: 0 | 1 | 2 | null;
}

export function gradeRecord(q: Question, rec: RunRecord, idx: CorpusIndex): RuleResult {
  const answer = rec.answer;
  const kvMissing = q.key_values.filter((kv) => !hasKeyValue(answer, kv)).map((kv) => kv.value);
  const cited = citedArticles(answer);
  const articlesHit = q.expected_articles.filter((a) => cited.has(articleKey(a.article) ?? '')).length;
  const policiesHit = q.expected_policies.filter((k) => {
    const p = idx.policy(k);
    return p ? citesPolicy(answer, p, idx.unitName(p.unit), idx.titleIsUnique(p.title)) : false;
  }).length;

  // Quotes are checked against what the trajectory read, the pinned policy and the expected policies.
  const readKeys = new Set([...rec.tool_calls.flatMap((t) => t.read_policies), ...(q.pinned_policy ? [q.pinned_policy] : []), ...q.expected_policies]);
  const sources = [...readKeys].flatMap((k) => {
    const p = idx.policy(k);
    return p ? policyTexts(p) : [];
  });
  const quotes = extractQuotes(answer);
  const checkable = quotes.filter((x) => detectLang(x) === q.policy_lang);
  const verified = checkable.filter((x) => quoteIsVerbatim(x, sources)).length;

  let conclusionQuoted: boolean | null = null;
  if (q.type !== 'calculation') {
    const conclusion = answer.split(/\*\*依据\*\*|依据[:：]|\*\*basis\*\*|basis:/i)[0];
    const quoteNums = quotes.flatMap((x) => extractNumbers(x).map((h) => h.n));
    const numeric = q.key_values.map((kv) => numericValue(kv.value)).filter((n): n is number => n !== null);
    const stated = numeric.filter((n) => extractNumbers(conclusion).some((h) => sameNumber(h.n, n)));
    if (stated.length > 0) conclusionQuoted = stated.every((n) => quoteNums.some((m) => sameNumber(m, n)));
  }

  const policyOf = (key: string) => {
    const p = idx.policy(key);
    return p ? { policy: p, unitName: idx.unitName(p.unit) } : undefined;
  };
  const leaks = q.forbidden.filter((f) => forbiddenFires(answer, f, policyOf)).map((f) => f.why);
  const refused = looksLikeRefusal(answer);
  const fabricated = (q.expect_no_basis && !refused) || verified < checkable.length;

  let ruleScore: RuleResult['ruleScore'] = null;
  if (leaks.length > 0) ruleScore = 0;
  else if (q.expect_no_basis) ruleScore = refused ? 2 : 0;
  else if (q.key_values.length > 0) {
    const hit = q.key_values.length - kvMissing.length;
    ruleScore = hit === q.key_values.length ? 2 : hit > 0 ? 1 : 0;
  }

  const reads = rec.tool_calls.flatMap((t) => t.read_policies);
  return {
    question: q.id,
    config: rec.config,
    rep: rec.rep,
    keyValues: { hit: q.key_values.length - kvMissing.length, total: q.key_values.length, missing: kvMissing },
    articles: { hit: articlesHit, total: q.expected_articles.length },
    policiesCited: { hit: policiesHit, total: q.expected_policies.length },
    quotes: { total: quotes.length, checked: checkable.length, verified },
    conclusionQuoted,
    leaks,
    refused,
    clarified: rec.clarified,
    langMatch: detectLang(answer) === q.question_lang,
    location: q.pinned_policy ? null : locationMetrics(q.expected_policies, reads),
    retrieval5: rec.retrieval ? retrievalRecall(q.expected_articles, rec.retrieval, 5) : null,
    retrieval10: rec.retrieval ? retrievalRecall(q.expected_articles, rec.retrieval, 10) : null,
    fabricated,
    ruleScore,
  };
}

/** The final 2 / 1 / 0: a leak is 0; otherwise the lower of the rule score and the judge's, whichever exist. */
export function finalScore(rule: RuleResult, judge: 0 | 1 | 2 | null): 0 | 1 | 2 {
  if (rule.leaks.length > 0) return 0;
  if (rule.ruleScore !== null && judge !== null) return Math.min(rule.ruleScore, judge) as 0 | 1 | 2;
  return rule.ruleScore ?? judge ?? 0;
}
