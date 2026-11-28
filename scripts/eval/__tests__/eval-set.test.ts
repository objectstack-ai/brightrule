/**
 * Integrity of the synthetic evaluation set (brightrule#69): the corpus is
 * synthetic and reproducible, and every question's label agrees with the
 * corpus — the expected articles exist, their text holds the key values, a
 * forbidden number never collides with the right basis, and a 「no basis」
 * label is checked against every policy on the asker's unit chain.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BrightRuleSeedData } from '../../../src/data/seed.js';
import { buildCorpus, corePolicies } from '../corpus/index.js';
import { DEFAULT_DISTRACTORS, distractors } from '../corpus/distractors.js';
import { unitChain } from '../corpus/units.js';
import { corpusIndex } from '../grade/corpus-index.js';
import { forbiddenFires, hasKeyValue, policyTexts, squash } from '../grade/rules.js';
import { buildQuestionSet } from '../questions/index.js';
import type { CorpusPolicy, Question } from '../schema.js';

const corpus = buildCorpus();
const core = corpus.policies.filter((p) => p.origin !== 'distractor');
const byKey = new Map(corpus.policies.map((p) => [p.key, p]));
const set = buildQuestionSet();
const idx = corpusIndex(corpus);
const personas = new Map(corpus.personas.map((p) => [p.id, p]));

/** The text of one article (by its span in the article index) or attachment of a policy. */
function articleText(p: CorpusPolicy, article: string): string {
  const att = p.attachments.find((a) => a.label === article);
  if (att) return att.body_md ?? '';
  const e = p.article_index.find((x) => x.article === article);
  if (!e) throw new Error(`${p.key} has no ${article}`);
  return Array.from(p.body_md).slice(e.redacted[0], e.redacted[1]).join('');
}

/** Published core policies on the persona's unit chain (restricted ones only when asked for). */
function chainPolicies(q: Question, withRestricted = true): CorpusPolicy[] {
  const unit = personas.get(q.persona)!.unit;
  const chain = unitChain(unit, corpus.units);
  return core.filter((p) => chain.includes(p.unit) && p.status === 'published' && (withRestricted || !p.restricted_to));
}

const policyOf = (key: string) => {
  const p = byKey.get(key);
  return p ? { policy: p, unitName: idx.unitName(p.unit) } : undefined;
};

describe('the synthetic corpus', () => {
  it('has the shape the card asks for: 60–100 core policies, group + 3 subsidiaries, an English sample, 1,000–2,000 distractors', () => {
    expect(core.length).toBeGreaterThanOrEqual(60);
    expect(core.length).toBeLessThanOrEqual(100);
    const en = core.filter((p) => p.lang === 'en');
    expect(en.length).toBeGreaterThanOrEqual(15);
    expect(en.length).toBeLessThanOrEqual(20);
    expect(corpus.policies.length - core.length).toBe(DEFAULT_DISTRACTORS);
    expect(DEFAULT_DISTRACTORS).toBeGreaterThanOrEqual(1000);
    expect(DEFAULT_DISTRACTORS).toBeLessThanOrEqual(2000);
    const companies = corpus.units.filter((u) => u.parent === 'DEMO-GROUP' && !u.distractor && u.code !== 'DEMO-INTL');
    expect(companies.map((u) => u.code).sort()).toEqual(['DEMO-A', 'DEMO-B', 'DEMO-C']);
  });

  it('covers 转发 / 参照执行, 试行, 已废止, 草稿, 限定范围 and same-title policies of different units', () => {
    expect(core.some((p) => p.issuance_type === 'forward')).toBe(true);
    expect(core.some((p) => p.issuance_type === 'reference')).toBe(true);
    expect(core.filter((p) => p.is_trial).length).toBeGreaterThanOrEqual(3);
    expect(core.filter((p) => p.status === 'abolished').length).toBeGreaterThanOrEqual(4);
    expect(core.filter((p) => p.status === 'draft').length).toBeGreaterThanOrEqual(4);
    expect(core.filter((p) => p.restricted_to).length).toBeGreaterThanOrEqual(3);
    const titles = core.filter((p) => p.status === 'published').map((p) => p.title);
    expect(titles.filter((t, i) => titles.indexOf(t) !== i).length).toBeGreaterThanOrEqual(5);
  });

  it('gives every distractor a body, and same-title distractors for the core families', () => {
    const ds = corpus.policies.filter((p) => p.origin === 'distractor');
    expect(ds.every((p) => p.body_md.length > 200 && p.article_index.length >= 5)).toBe(true);
    expect(ds.filter((p) => p.title === '差旅费报销管理办法').length).toBeGreaterThanOrEqual(10);
    expect(ds.every((p) => corpus.units.find((u) => u.code === p.unit)?.distractor)).toBe(true);
  });

  it('is reproducible: the same seed gives the same distractors byte for byte', () => {
    const hash = (n: number) => createHash('sha256').update(JSON.stringify(distractors(n))).digest('hex');
    expect(hash(DEFAULT_DISTRACTORS)).toBe(hash(DEFAULT_DISTRACTORS));
    expect(hash(DEFAULT_DISTRACTORS).slice(0, 16)).toBe('d017476de0305655');
    expect(distractors(1000)).toHaveLength(1000);
    expect(distractors(2000)).toHaveLength(2000);
  });

  it('keeps every key unique and every reference resolvable', () => {
    expect(new Set(corpus.policies.map((p) => p.key)).size).toBe(corpus.policies.length);
    const units = new Set(corpus.units.map((u) => u.code));
    for (const p of corpus.policies) {
      expect(units.has(p.unit), p.key).toBe(true);
      if (p.parent) expect(byKey.has(p.parent), `${p.key} → ${p.parent}`).toBe(true);
    }
    for (const u of corpus.units) if (u.parent) expect(units.has(u.parent), u.code).toBe(true);
    for (const p of corpus.personas) if (p.unit) expect(units.has(p.unit), p.id).toBe(true);
  });

  it('is synthetic: every unit is named 示例… / Example…, every account is at example.test', () => {
    for (const u of corpus.units) expect(u.name, u.code).toMatch(/^(示例|Example )/);
    for (const p of corpus.personas) expect(p.email).toMatch(/@example\.test$/);
  });

  it("carries the app's ten dev seed policies unchanged", () => {
    const seed = (BrightRuleSeedData.find((s) => s.object === 'brightrule_policy')?.records ?? []) as Array<Record<string, unknown>>;
    expect(seed).toHaveLength(10);
    for (const s of seed) {
      const p = byKey.get(String(s.policy_no));
      expect(p?.origin, String(s.title)).toBe('seed');
      expect(p?.body_md).toBe(s.body_md);
    }
  });

  it('indexes every article where the body holds it', () => {
    for (const b of corePolicies()) {
      const body = Array.from(b.policy.body_md);
      for (const e of b.policy.article_index) {
        expect(body.slice(e.redacted[0], e.redacted[1]).join(''), `${b.policy.key} ${e.article}`).toMatch(new RegExp(`^\\*\\*${e.article}\\*\\*`));
      }
    }
  });
});

describe('the question set', () => {
  const zh = set.questions.filter((q) => q.question_lang === 'zh' && q.policy_lang === 'zh');
  const en = set.questions.filter((q) => !(q.question_lang === 'zh' && q.policy_lang === 'zh'));
  const count = (qs: Question[], t: Question['type']) => qs.filter((q) => q.type === t).length;

  it('has about 250 Chinese questions in the §4.2 ratios', () => {
    expect(zh.length).toBeGreaterThanOrEqual(240);
    expect(zh.length).toBeLessThanOrEqual(270);
    const scored = zh.filter((q) => q.type !== 'conflict').length;
    const share: Array<[Question['type'], number]> = [
      ['direct', 0.22], ['paraphrase', 0.14], ['calculation', 0.05], ['unit_scope', 0.14], ['rank_tier', 0.05],
      ['cross_reference', 0.1], ['no_basis', 0.12], ['permission', 0.08], ['clarify', 0.05], ['pinned', 0.05],
    ];
    for (const [t, s] of share) expect(Math.abs(count(zh, t) / scored - s), t).toBeLessThan(0.015);
    expect(count(zh, 'no_basis')).toBeGreaterThanOrEqual(30);
    for (const k of ['peer', 'restricted', 'draft', 'abolished'] as const) {
      expect(zh.filter((q) => q.permission_kind === k).length, k).toBeGreaterThanOrEqual(5);
    }
    expect(count(zh, 'conflict')).toBeGreaterThanOrEqual(2);
    expect(count(zh, 'conflict')).toBeLessThanOrEqual(4);
    expect(zh.filter((q) => q.context_turns.length > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('has an English sample of about 60 covering en→en, en→zh and zh→en', () => {
    expect(en.length).toBeGreaterThanOrEqual(55);
    expect(en.length).toBeLessThanOrEqual(70);
    const pair = (a: string, b: string) => en.filter((q) => q.question_lang === a && q.policy_lang === b).length;
    expect(pair('en', 'en')).toBeGreaterThanOrEqual(25);
    expect(pair('en', 'zh')).toBeGreaterThanOrEqual(10);
    expect(pair('zh', 'en')).toBeGreaterThanOrEqual(10);
  });

  it('labels every question fully: persona, language, source, permission kind', () => {
    expect(new Set(set.questions.map((q) => q.id)).size).toBe(set.questions.length);
    for (const q of set.questions) {
      expect(personas.has(q.persona), q.id).toBe(true);
      expect(q.source, q.id).toBe('written');
      expect(q.type === 'permission', q.id).toBe(Boolean(q.permission_kind));
      if (!q.expect_no_basis) expect(q.expected_policies.length, q.id).toBeGreaterThan(0);
      if (q.pinned_policy) expect(q.expected_policies, q.id).toContain(q.pinned_policy);
      if (q.expect_no_basis && q.type !== 'pinned') expect(q.expected_policies, q.id).toEqual([]);
    }
  });

  it('expects only published policies, on the asker\'s unit chain when the asker has a unit', () => {
    for (const q of set.questions) {
      const unit = personas.get(q.persona)!.unit;
      const chain = unitChain(unit, corpus.units);
      for (const k of q.expected_policies) {
        const p = byKey.get(k);
        expect(p?.status, `${q.id} → ${k}`).toBe('published');
        expect(p?.restricted_to, `${q.id} → ${k}`).toBeUndefined();
        if (unit) expect(chain, `${q.id} → ${k}`).toContain(p!.unit);
      }
      for (const a of q.expected_articles) expect(q.expected_policies, `${q.id} cites ${a.policy}`).toContain(a.policy);
    }
  });

  it("finds every key value in the text of the expected articles (calculations excepted)", () => {
    for (const q of set.questions.filter((x) => x.type !== 'calculation')) {
      const text = q.expected_articles.map((a) => articleText(byKey.get(a.policy)!, a.article)).join('\n');
      for (const kv of q.key_values) expect(hasKeyValue(text, kv), `${q.id}: ${kv.value}`).toBe(true);
    }
  });

  it('never forbids what the right basis says', () => {
    for (const q of set.questions) {
      const right = q.expected_policies.flatMap((k) => policyTexts(byKey.get(k)!));
      const basis = q.expect_no_basis && q.type !== 'pinned' ? chainPolicies(q, false).flatMap(policyTexts) : right;
      for (const f of q.forbidden) {
        expect(basis.some((t) => forbiddenFires(t, f, policyOf)), `${q.id}: ${f.why}`).toBe(false);
        if (f.policy) expect(byKey.has(f.policy), `${q.id} forbids ${f.policy}`).toBe(true);
      }
    }
  });

  it('checks every 「no basis」 label: no published policy on the asker\'s chain holds the topic', () => {
    for (const q of set.questions.filter((x) => x.expect_no_basis && !x.permission_kind?.match(/restricted/))) {
      expect(q.absent_terms.length, q.id).toBeGreaterThan(0);
      const scope = q.pinned_policy ? [byKey.get(q.pinned_policy)!] : chainPolicies(q);
      for (const term of q.absent_terms) {
        const holder = scope.find((p) => policyTexts(p).some((t) => squash(t).includes(squash(term))));
        expect(holder?.key, `${q.id}: 「${term}」`).toBeUndefined();
      }
    }
  });

  it('asks back only where the asker\'s answer changes by unit or rank', () => {
    for (const q of set.questions.filter((x) => x.should_clarify)) {
      expect(['clarify', 'rank_tier'], q.id).toContain(q.type);
    }
    // Clarify questions on unit go to askers the platform has no unit for.
    for (const q of set.questions.filter((x) => x.type === 'clarify' && x.should_clarify)) {
      expect(personas.get(q.persona)!.unit, q.id).toBeUndefined();
    }
  });
});
