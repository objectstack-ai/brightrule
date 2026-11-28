/**
 * Aggregate graded records into the report brightrule#69 asks for: total and
 * per-type score, location recall@1 / @3 and MRR, pure-retrieval recall@5 /
 * @10, verifiable-quote rate, fabrication rate, no-basis refusal rate,
 * clarify precision / recall, leaks, answer-language match, latency, tokens,
 * and the noise between repetitions. Chinese and English are reported apart.
 */
import type { Question, QuestionType, RunRecord } from '../schema.js';
import type { RuleResult } from './rules.js';

export interface Graded {
  rule: RuleResult;
  judge: 0 | 1 | 2 | null;
  score: 0 | 1 | 2;
  record: RunRecord;
  question: Question;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const quantile = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
};
const ratio = (num: number, den: number) => (den ? num / den : null);

export interface ScoreLine {
  n: number;
  points: number;
  max: number;
  pct: number | null;
}

const scoreLine = (gs: Graded[]): ScoreLine => {
  const points = gs.reduce((a, g) => a + g.score, 0);
  return { n: gs.length, points, max: gs.length * 2, pct: ratio(points, gs.length * 2) };
};

export interface Report {
  config: string;
  records: number;
  reps: number;
  score: ScoreLine;
  /** Permission questions are excluded from the total until row-level rules land (brightrule#70); reported here instead. */
  byType: Partial<Record<QuestionType, ScoreLine>>;
  byLang: Record<string, ScoreLine>;
  location: { n: number; recall1: number | null; recall3: number | null; mrr: number | null };
  retrieval: { n: number; recall5: number | null; recall10: number | null };
  quotes: { checked: number; verified: number; rate: number | null };
  conclusionQuoted: number | null;
  fabricationRate: number | null;
  noBasisRefusalRate: number | null;
  clarify: { precision: number | null; recall: number | null; asked: number; shouldAsk: number };
  leaks: { total: number; byKind: Record<string, number> };
  langMatchRate: number | null;
  latencyMs: { median: number | null; p90: number | null };
  inputTokens: { mean: number | null };
  errors: number;
  noise: { perRepPct: number[]; stdev: number | null; range: number | null };
}

export function aggregate(config: string, graded: Graded[]): Report {
  const scored = graded.filter((g) => g.question.type !== 'permission' && g.question.type !== 'conflict');
  const byType: Report['byType'] = {};
  for (const t of new Set(graded.map((g) => g.question.type))) byType[t] = scoreLine(graded.filter((g) => g.question.type === t));
  const langKey = (g: Graded) => `${g.question.question_lang}→${g.question.policy_lang}`;
  const byLang: Record<string, ScoreLine> = {};
  for (const k of new Set(scored.map(langKey))) byLang[k] = scoreLine(scored.filter((g) => langKey(g) === k));

  const locs = graded.map((g) => g.rule.location).filter((l): l is NonNullable<typeof l> => l !== null);
  const r5 = graded.map((g) => g.rule.retrieval5).filter((x): x is number => x !== null);
  const r10 = graded.map((g) => g.rule.retrieval10).filter((x): x is number => x !== null);
  const checked = graded.reduce((a, g) => a + g.rule.quotes.checked, 0);
  const verified = graded.reduce((a, g) => a + g.rule.quotes.verified, 0);
  const cq = graded.map((g) => g.rule.conclusionQuoted).filter((x): x is boolean => x !== null);
  const noBasis = graded.filter((g) => g.question.expect_no_basis && g.question.type !== 'permission');
  const asked = graded.filter((g) => g.rule.clarified);
  const shouldAsk = graded.filter((g) => g.question.should_clarify);
  const leakGs = graded.filter((g) => g.rule.leaks.length > 0);
  const byKind: Record<string, number> = {};
  for (const g of leakGs) {
    const k = g.question.permission_kind ?? g.question.type;
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const latencies = graded.filter((g) => !g.record.error).map((g) => g.record.latency_ms);
  const tokens = graded.map((g) => g.record.input_tokens).filter((x): x is number => typeof x === 'number');

  const reps = [...new Set(graded.map((g) => g.record.rep))].sort((a, b) => a - b);
  const perRepPct = reps.map((r) => scoreLine(scored.filter((g) => g.record.rep === r)).pct ?? 0);
  const m = mean(perRepPct);
  const stdev = perRepPct.length > 1 && m !== null ? Math.sqrt(perRepPct.reduce((a, x) => a + (x - m) ** 2, 0) / (perRepPct.length - 1)) : null;

  return {
    config,
    records: graded.length,
    reps: reps.length,
    score: scoreLine(scored),
    byType,
    byLang,
    location: { n: locs.length, recall1: mean(locs.map((l) => l.recall1)), recall3: mean(locs.map((l) => l.recall3)), mrr: mean(locs.map((l) => l.rr)) },
    retrieval: { n: r5.length, recall5: mean(r5), recall10: mean(r10) },
    quotes: { checked, verified, rate: ratio(verified, checked) },
    conclusionQuoted: ratio(cq.filter(Boolean).length, cq.length),
    fabricationRate: ratio(graded.filter((g) => g.rule.fabricated).length, graded.length),
    noBasisRefusalRate: ratio(noBasis.filter((g) => g.rule.refused && g.rule.leaks.length === 0).length, noBasis.length),
    clarify: {
      precision: ratio(asked.filter((g) => g.question.should_clarify).length, asked.length),
      recall: ratio(shouldAsk.filter((g) => g.rule.clarified).length, shouldAsk.length),
      asked: asked.length,
      shouldAsk: shouldAsk.length,
    },
    leaks: { total: leakGs.length, byKind },
    langMatchRate: ratio(graded.filter((g) => g.rule.langMatch).length, graded.length),
    latencyMs: { median: quantile(latencies, 0.5), p90: quantile(latencies, 0.9) },
    inputTokens: { mean: mean(tokens) },
    errors: graded.filter((g) => g.record.error).length,
    noise: { perRepPct, stdev, range: perRepPct.length ? Math.max(...perRepPct) - Math.min(...perRepPct) : null },
  };
}

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null, d = 2) => (x === null ? '—' : x.toFixed(d));

/** The report as Markdown, for docs/evaluation-*.md. */
export function reportMarkdown(r: Report): string {
  const typeRows = Object.entries(r.byType).map(([t, s]) => `| ${t} | ${s!.n} | ${s!.points}/${s!.max} | ${pct(s!.pct)} |`);
  const langRows = Object.entries(r.byLang).map(([k, s]) => `| ${k} | ${s.n} | ${s.points}/${s.max} | ${pct(s.pct)} |`);
  return [
    `### ${r.config}`,
    ``,
    `${r.records} records, ${r.reps} rep(s), ${r.errors} error(s). Total excludes permission and conflict questions (reported per type).`,
    ``,
    `| Measure | Value |`,
    `|---|---|`,
    `| Score (2/1/0) | ${r.score.points}/${r.score.max} = ${pct(r.score.pct)} |`,
    `| Score per rep (noise between reps) | ${r.noise.perRepPct.map((x) => pct(x)).join(' / ') || '—'} (sd ${pct(r.noise.stdev)}, range ${pct(r.noise.range)}) |`,
    `| Location recall@1 / @3 / MRR (policies read) | ${pct(r.location.recall1)} / ${pct(r.location.recall3)} / ${num(r.location.mrr)} (n=${r.location.n}) |`,
    `| Retrieval recall@5 / @10 (articles) | ${pct(r.retrieval.recall5)} / ${pct(r.retrieval.recall10)} (n=${r.retrieval.n}) |`,
    `| Verifiable quotes | ${r.quotes.verified}/${r.quotes.checked} = ${pct(r.quotes.rate)} |`,
    `| Conclusion numbers found in quotes | ${pct(r.conclusionQuoted)} |`,
    `| Fabrication rate | ${pct(r.fabricationRate)} |`,
    `| No-basis correct refusals | ${pct(r.noBasisRefusalRate)} |`,
    `| Clarify precision / recall | ${pct(r.clarify.precision)} / ${pct(r.clarify.recall)} (asked ${r.clarify.asked}, should ${r.clarify.shouldAsk}) |`,
    `| Leaks | ${r.leaks.total} ${JSON.stringify(r.leaks.byKind)} |`,
    `| Answer language matches question | ${pct(r.langMatchRate)} |`,
    `| Latency median / p90 | ${num(r.latencyMs.median === null ? null : r.latencyMs.median / 1000, 1)} s / ${num(r.latencyMs.p90 === null ? null : r.latencyMs.p90 / 1000, 1)} s |`,
    `| Input tokens (mean) | ${num(r.inputTokens.mean, 0)} |`,
    ``,
    `| Type | n | Points | Score |`,
    `|---|---|---|---|`,
    ...typeRows,
    ``,
    `| Question → policy language | n | Points | Score |`,
    `|---|---|---|---|`,
    ...langRows,
    ``,
  ].join('\n');
}
