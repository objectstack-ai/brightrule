import { describe, expect, it } from 'vitest';
import { buildCorpus } from '../corpus/index.js';
import { corpusIndex } from '../grade/corpus-index.js';
import { buildJudgePrompt, JUDGE_SYSTEM, parseJudgeVerdict } from '../grade/judge.js';
import { aggregate, reportMarkdown, type Graded } from '../grade/metrics.js';
import {
  articleKey, citedArticles, detectLang, extractNumbers, extractQuotes, finalScore, forbiddenFires, gradeRecord,
  hasKeyValue, locationMetrics, looksLikeClarifyingQuestion, looksLikeRefusal, numericValue, quoteIsVerbatim,
  retrievalRecall, zhToNumber,
} from '../grade/rules.js';
import { buildQuestionSet } from '../questions/index.js';
import { RunRecord, type Question } from '../schema.js';

const corpus = buildCorpus({ distractors: 0 });
const idx = corpusIndex(corpus);
const questions = new Map(buildQuestionSet().questions.map((q) => [q.id, q]));
const Q = (id: string) => questions.get(id)!;
const rec = (question: string, answer: string, extra: Partial<RunRecord> = {}): RunRecord =>
  RunRecord.parse({ question, config: 'test', rep: 1, answer, clarified: false, tool_calls: [], latency_ms: 1000, ...extra });

describe('numbers', () => {
  it('reads Chinese numerals', () => {
    expect(zhToNumber('十二')).toBe(12);
    expect(zhToNumber('二十')).toBe(20);
    expect(zhToNumber('三百五十')).toBe(350);
    expect(zhToNumber('一千二百')).toBe(1200);
    expect(zhToNumber('一万')).toBe(10000);
    expect(Number.isNaN(zhToNumber('线'))).toBe(true);
  });

  it('extracts numbers with 万 / commas / million, and Chinese numerals before a unit but not in 第X条', () => {
    const ns = (s: string) => extractNumbers(s).map((h) => h.n);
    expect(ns('合同金额 50 万元以上')).toEqual([500000]);
    expect(ns('RMB 500,000 or USD 0.5 million')).toEqual([500000, 500000]);
    expect(ns('每公里 1.2 元，每晚 600 元')).toEqual([1.2, 600]);
    expect(ns('依据第十五条，年休假十天')).toEqual([10]);
    expect(ns('一线城市')).toEqual([]);
  });

  it('matches key values numerically or as a phrase', () => {
    expect(numericValue('50 万')).toBe(500000);
    expect(numericValue('9 月 30 日')).toBeNull();
    expect(hasKeyValue('须经法务审查：合同金额五十万元以上', { value: '50 万' })).toBe(true);
    expect(hasKeyValue('contracts of RMB 500,000 or more', { value: '50 万' })).toBe(true);
    expect(hasKeyValue('每晚不超过600元', { value: '600' })).toBe(true);
    expect(hasKeyValue('每晚不超过6000元', { value: '600' })).toBe(false);
    expect(hasKeyValue('每年 9月30日 前报送', { value: '9 月 30 日' })).toBe(true);
    expect(hasKeyValue('试用期不超过两个月', { value: '二个月', any_of: ['两个月'] })).toBe(true);
    expect(hasKeyValue('report within 1 hour', { value: '1 hour' })).toBe(true);
  });
});

describe('articles and quotes', () => {
  it('maps 第X条, Article N and 附件N to one key', () => {
    expect(articleKey('第十五条')).toBe('a15');
    expect(articleKey('第15条')).toBe('a15');
    expect(articleKey('Article 15')).toBe('a15');
    expect(articleKey('附件1')).toBe('x1');
    expect(articleKey('Appendix 2')).toBe('x2');
    expect([...citedArticles('依据第五条、第十一条及附件 1；see Article 3')].sort()).toEqual(['a11', 'a3', 'a5', 'x1']);
  });

  it('finds quotes and checks them verbatim, ellipsis excerpts piece by piece', () => {
    const body = '**第五条** 住宿标准\n\n一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元，其他城市不超过 400 元，超标部分由个人承担。';
    const answer = '依据：第五条「一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元」；“其他城市不超过 300 元”';
    const qs = extractQuotes(answer);
    expect(qs).toHaveLength(2);
    expect(quoteIsVerbatim(qs[0], [body])).toBe(true);
    expect(quoteIsVerbatim(qs[1], [body])).toBe(false);
    expect(quoteIsVerbatim('一线城市……超标部分由个人承担', [body])).toBe(true);
    expect(extractQuotes('「短」')).toEqual([]);
  });
});

describe('leaks, refusals, clarifying questions, language', () => {
  const policyOf = (k: string) => {
    const p = idx.policy(k);
    return p ? { policy: p, unitName: idx.unitName(p.unit) } : undefined;
  };

  it('fires a forbidden number only near its word, and a forbidden policy by 文号 or display name', () => {
    expect(forbiddenFires('婚假 15 天', { value: '15', near: '婚假', why: '' }, policyOf)).toBe(true);
    expect(forbiddenFires('婚假：现行制度中未找到相关规定。另外，满 20 年的年休假为 15 天', { value: '15', near: '婚假', why: '' }, policyOf)).toBe(false);
    expect(forbiddenFires('标准每月 160 元', { value: '160', why: '' }, policyOf)).toBe(true);
    expect(forbiddenFires('标准每月 1600 元', { value: '160', why: '' }, policyOf)).toBe(false);
    expect(forbiddenFires('出处：示例甲公司：差旅费报销管理办法 第五条', { policy: 'A-FIN-010', why: '' }, policyOf)).toBe(true);
    expect(forbiddenFires('出处：示例甲司财字〔2026〕2号', { policy: 'A-FIN-010', why: '' }, policyOf)).toBe(true);
    expect(forbiddenFires('出处：示例集团：差旅费报销管理办法', { policy: 'A-FIN-010', why: '' }, policyOf)).toBe(false);
  });

  it('recognises a no-basis answer in Chinese and English', () => {
    expect(looksLikeRefusal('**结论** 现行制度中未找到婚假的相关规定。')).toBe(true);
    expect(looksLikeRefusal('本制度中没有相关规定，请向归口部门咨询。')).toBe(true);
    expect(looksLikeRefusal('I could not find a policy that covers maternity leave.')).toBe(true);
    expect(looksLikeRefusal('No policy in force covers paternity leave.')).toBe(true);
    expect(looksLikeRefusal('一线城市每晚不超过 600 元。')).toBe(false);
  });

  it('recognises a clarifying question at the end of a reply', () => {
    expect(looksLikeClarifyingQuestion('集团规定 600 元，甲公司 500 元。请问您在哪家公司？告诉我后按贵公司的规定答复。')).toBe(true);
    expect(looksLikeClarifyingQuestion('Staff get 14 days and managers 18. Which grade are you?')).toBe(true);
    expect(looksLikeClarifyingQuestion('一线城市每晚不超过 600 元。以正式发布的制度文本为准。')).toBe(false);
    // Seen on the first smoke run: the ask sits in the conclusion and has no question mark.
    expect(looksLikeClarifyingQuestion('**结论** 集团每晚 600 元，甲公司 500 元。请告诉我您所在的公司和职级，我按贵公司的规定答复。\n\n**依据** 第五条……\n\n以正式发布的制度文本为准。')).toBe(true);
    expect(looksLikeClarifyingQuestion('Group staff get 18 days. Please let me know which company you work for and I will check its handbook.')).toBe(true);
    expect(looksLikeClarifyingQuestion('如有其他问题，请告诉我。以正式发布的制度文本为准。')).toBe(false);
  });

  it('detects the answer language, Chinese policy titles in an English answer notwithstanding', () => {
    expect(detectLang('**结论** 每晚不超过 600 元。')).toBe('zh');
    expect(detectLang('The hotel limit is RMB 600 per night under 《差旅费报销管理办法》 Article 5, which applies to first-tier cities.')).toBe('en');
  });
});

describe('location and retrieval', () => {
  it('computes recall@1 / @3 and reciprocal rank over the policies read, in order', () => {
    expect(locationMetrics(['A'], ['X', 'A', 'A'])).toEqual({ recall1: 0, recall3: 1, rr: 0.5 });
    expect(locationMetrics(['A', 'B'], ['A', 'Y', 'Z', 'B'])).toEqual({ recall1: 0.5, recall3: 0.5, rr: 1 });
    expect(locationMetrics(['A'], [])).toEqual({ recall1: 0, recall3: 0, rr: 0 });
    expect(locationMetrics([], ['A'])).toBeNull();
  });

  it('computes article-level recall@k of a retrieval list, 第X条 and Article N alike', () => {
    const hits = [{ policy: 'P', article: '第三条' }, { policy: 'P', article: 'Article 5' }];
    expect(retrievalRecall([{ policy: 'P', article: '第五条' }], hits, 1)).toBe(0);
    expect(retrievalRecall([{ policy: 'P', article: '第五条' }], hits, 5)).toBe(1);
  });
});

describe('grading one record', () => {
  it('scores a right, cited, quoted answer 2 with its article, policy and quote checked', () => {
    const q = Q('zh-direct-01');
    const answer = [
      '**结论** 去上海出差，住宿每晚不超过 600 元。',
      '**依据** 第五条：「一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元，其他城市不超过 400 元，超标部分由个人承担。」',
      '**出处** [示例集团：差旅费报销管理办法](/x) 示例集团财字〔2026〕3号 第五条',
    ].join('\n');
    const r = gradeRecord(q, rec(q.id, answer, { tool_calls: [{ tool: 'get_record', args: {}, read_policies: ['FIN-001'], listed_policies: [] }] }), idx);
    expect(r.ruleScore).toBe(2);
    expect(r.articles).toEqual({ hit: 1, total: 1 });
    expect(r.policiesCited).toEqual({ hit: 1, total: 1 });
    expect(r.quotes).toEqual({ total: 1, checked: 1, verified: 1 });
    expect(r.conclusionQuoted).toBe(true);
    expect(r.location).toEqual({ recall1: 1, recall3: 1, rr: 1 });
    expect(r.fabricated).toBe(false);
    expect(r.langMatch).toBe(true);
  });

  it('scores 0 for a leak even when the right number is there', () => {
    const q = Q('zh-perm-draft-01');
    const r = gradeRecord(q, rec(q.id, '现行每月 100 元；修订稿拟调整为每月 160 元。'), idx);
    expect(r.leaks).toHaveLength(1);
    expect(r.ruleScore).toBe(0);
    expect(finalScore(r, 2)).toBe(0);
  });

  it('scores a no-basis question 2 for a refusal and 0 (fabricated) for an invented answer', () => {
    const q = Q('zh-nobasis-01');
    expect(gradeRecord(q, rec(q.id, '**结论** 现行制度中未找到婚假的规定，请向人力资源部门咨询。'), idx).ruleScore).toBe(2);
    const made = gradeRecord(q, rec(q.id, '**结论** 婚假 3 天。'), idx);
    expect(made.ruleScore).toBe(0);
    expect(made.fabricated).toBe(true);
  });

  it('checks quotes against what the trajectory saw, not the expected policies', () => {
    const q = Q('zh-direct-01');
    const answer = '每晚不超过 600 元。依据：「一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元」';
    const unread = gradeRecord(q, rec(q.id, answer), idx);
    expect(unread.quotes.verified).toBe(0);
    expect(unread.fabricated).toBe(true);
    const retrieved = gradeRecord(q, rec(q.id, answer, { retrieval: [{ policy: 'FIN-001', article: '第五条' }] }), idx);
    expect(retrieved.quotes.verified).toBe(1);
  });

  it('does not count a no-basis question answered with a question as fabricated', () => {
    const q = Q('zh-nobasis-01');
    const r = gradeRecord(q, rec(q.id, '请问您是哪家公司的？告诉我后我按贵公司的制度查。'), idx);
    expect(r.ruleScore).toBe(0);
    expect(r.fabricated).toBe(false);
  });

  it('flags a made-up quote as fabricated and scores partial key values 1', () => {
    const q = Q('zh-direct-06');
    const r = gradeRecord(q, rec(q.id, '口令不少于 12 位。依据：「口令须每半年更换一次以确保安全」'), idx);
    expect(r.ruleScore).toBe(1);
    expect(r.fabricated).toBe(true);
  });

  it('leaves questions without a checkable value to the judge, and takes the lower of the two scores', () => {
    const q: Question = Q('zh-direct-19');
    const r = gradeRecord(q, rec(q.id, '须经承办部门负责人和办公室主任审批。'), idx);
    expect(r.ruleScore).toBeNull();
    expect(finalScore(r, 2)).toBe(2);
    expect(finalScore(r, null)).toBe(0);
    const r2 = gradeRecord(Q('zh-direct-01'), rec('zh-direct-01', '每晚不超过 600 元'), idx);
    expect(finalScore(r2, 1)).toBe(1);
  });

  it('marks an English question answered in Chinese as a language mismatch', () => {
    const q = Q('enzh-direct-06');
    expect(gradeRecord(q, rec(q.id, '一线城市每晚不超过 600 元。'), idx).langMatch).toBe(false);
    expect(gradeRecord(q, rec(q.id, 'The cap is RMB 600 per night in first-tier cities such as Shanghai.'), idx).langMatch).toBe(true);
  });
});

describe('the judge', () => {
  it('prompts with the question, the asker and the reference points, and never the configuration', () => {
    const q = Q('zh-clarify-01');
    const persona = corpus.personas.find((p) => p.id === q.persona)!;
    const prompt = buildJudgePrompt({ question: q, persona, answer: '乙公司按集团每晚不超过 600 元。', clarifyText: '请问您在哪家公司？' });
    expect(prompt).toContain(q.question);
    for (const p of q.answer_points) expect(prompt).toContain(p);
    expect(prompt).toContain('没有登记所属单位');
    expect(prompt).toContain('第一段：反问');
    expect(`${JUDGE_SYSTEM}${prompt}`).not.toMatch(/haiku|deepseek|config|route/i);
  });

  it('parses the first JSON object of a reply and keeps the point list the right length', () => {
    expect(parseJudgeVerdict('好的。{"score": 2, "points": [true, true], "reason": "对"}', 2)).toEqual({ score: 2, points: [true, true], reason: '对' });
    expect(parseJudgeVerdict('{"score": 1, "points": [true], "reason": "漏条件"}', 3).points).toEqual([true, false, false]);
    expect(() => parseJudgeVerdict('{"score": 3, "points": [], "reason": ""}', 0)).toThrow();
    expect(() => parseJudgeVerdict('no json', 0)).toThrow();
  });
});

describe('the report', () => {
  it('aggregates scores, clarify precision / recall and the noise between reps', () => {
    const mk = (id: string, answer: string, rep: number, clarified = false): Graded => {
      const q = Q(id);
      const record = rec(id, answer, { rep, clarified, latency_ms: rep * 1000, input_tokens: 1000 });
      const rule = gradeRecord(q, record, idx);
      return { rule, judge: null, score: finalScore(rule, null), record, question: q };
    };
    const graded = [
      mk('zh-direct-01', '每晚不超过 600 元', 1),
      mk('zh-direct-01', '每晚不超过 500 元', 2),
      mk('zh-clarify-01', '乙公司每晚不超过 600 元', 1, true),
      mk('zh-clarify-01', '每晚不超过 600 元', 2, false),
      mk('zh-clarify-08', '须办公室主任批准', 1, true),
    ];
    const r = aggregate('test', graded);
    expect(r.records).toBe(5);
    expect(r.reps).toBe(2);
    expect(r.clarify).toEqual({ precision: 0.5, recall: 0.5, asked: 2, shouldAsk: 2 });
    expect(r.noise.perRepPct).toHaveLength(2);
    expect(r.noise.range).toBeGreaterThan(0);
    expect(r.latencyMs.median).toBe(1000);
    expect(reportMarkdown(r)).toContain('Clarify precision / recall | 50.0% / 50.0%');
  });
});
