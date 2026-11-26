import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BrightRuleSeedData } from '../seed.js';
import { CHARS_PER_TOKEN, countChars, estimateTokens, type ArticleIndexEntry } from '../document-text.js';

type Row = Record<string, unknown>;

const rows = (object: string) => (BrightRuleSeedData.find((s) => s.object === object)?.records ?? []) as Row[];
const attachments = rows('brightrule_policy_attachment');
const policies = rows('brightrule_policy');
/** The body originals: a second, update-only dataset on the policy object. */
const policyOriginals = (BrightRuleSeedData.filter((s) => s.object === 'brightrule_policy')[1]?.records ?? []) as Row[];
const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('the seeded policy bodies', () => {
  it('seed no version or relation object: the body is on the policy (brightrule#45)', () => {
    expect(BrightRuleSeedData.map((s) => s.object).sort()).toEqual([
      'brightrule_clause',
      'brightrule_policy',
      'brightrule_policy',
      'brightrule_policy_attachment',
      'brightrule_policy_suggestion',
      'sys_business_unit',
    ]);
  });

  it('give every policy a body and the fields of its info table', () => {
    for (const p of policies) {
      expect(String(p.body_md ?? ''), String(p.title)).not.toBe('');
      expect(String(p.doc_no ?? ''), String(p.title)).toMatch(/〔\d{4}〕\d+号$/);
      expect(p).not.toHaveProperty('current_version');
    }
  });

  it("index every clause of the policy at the offsets where the body holds it", () => {
    const clauses = rows('brightrule_clause');
    for (const p of policies) {
      const body = Array.from(String(p.body_md));
      const index = p.article_index as ArticleIndexEntry[];
      const ownClauses = clauses.filter((c) => c.policy === p.title);
      expect(index.map((e) => e.article)).toEqual(ownClauses.map((c) => String(c.citation).split('》').pop()));
      index.forEach((entry, i) => {
        const span = body.slice(...entry.redacted).join('');
        expect(span.startsWith(`**${entry.article}**`)).toBe(true);
        expect(span.endsWith(String(ownClauses[i].content))).toBe(true);
      });
    }
  });

  it('mark the clauses of a published policy current, as the clause hook would', () => {
    for (const c of rows('brightrule_clause')) {
      const policy = policies.find((p) => p.title === c.policy);
      expect(c.is_current).toBe(policy?.status === 'published');
      expect(c).not.toHaveProperty('policy_version');
    }
  });

  it('count characters and estimate tokens from the stored text', () => {
    for (const row of [...policies, ...attachments]) {
      const text = row.body_md as string | undefined;
      if ('has_text' in row) expect(row.has_text).toBe(Boolean(text));
      expect(row.text_chars).toBe(text ? countChars(text) : 0);
      expect(row.text_tokens).toBe(text ? Math.ceil(countChars(text) / CHARS_PER_TOKEN) : 0);
    }
  });

  it('carry a synthetic original whose SHA-256 is the content hash, one per policy', () => {
    expect(policyOriginals.map((o) => o.title)).toEqual(policies.map((p) => p.title));
    for (const p of policies) expect(p).not.toHaveProperty('original_file');
    for (const row of [...policyOriginals, ...attachments]) {
      const ref = row.original_file as { $file: string };
      const bytes = readFileSync(packageRoot + ref.$file);
      expect(bytes.toString('utf8').startsWith('【合成示例原件】')).toBe(true);
      expect(row.content_hash, ref.$file).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });
});

describe("the seeded policies' source fields (brightrule#52)", () => {
  const units = rows('sys_business_unit');

  it('seed synthetic business units: a group and two subsidiaries under it', () => {
    const [group, ...subsidiaries] = units;
    expect(group.parent_business_unit_id).toBeUndefined();
    expect(subsidiaries.length).toBeGreaterThanOrEqual(2);
    for (const u of units) expect(String(u.name)).toMatch(/^示例/);
    for (const u of subsidiaries) expect(u.parent_business_unit_id).toBe(group.name);
  });

  it('give every policy a seeded owning unit, at least two of them in use', () => {
    const names = units.map((u) => u.name);
    for (const p of policies) expect(names, String(p.title)).toContain(p.owning_unit);
    expect(new Set(policies.map((p) => p.owning_unit)).size).toBeGreaterThanOrEqual(2);
  });

  it('cover 印发, 转发 and 参照执行; a forwarded or followed policy names its group policy', () => {
    expect(new Set(policies.map((p) => p.issuance_type))).toEqual(new Set(['issue', 'forward', 'reference']));
    const titles = policies.map((p) => p.title);
    for (const p of policies.filter((p) => p.issuance_type !== 'issue')) {
      expect(titles, String(p.title)).toContain(p.parent_policy);
      const parent = policies.find((q) => q.title === p.parent_policy)!;
      expect(parent.owning_unit).toBe(units[0].name);
    }
  });

  it('mark 试行 from the title, as the trial hook would, with one trial policy at least', () => {
    for (const p of policies) expect(p.is_trial, String(p.title)).toBe(/试行|暂行/.test(String(p.title)));
    expect(policies.some((p) => p.is_trial)).toBe(true);
  });

  it('date the issuing notice no later than the policy takes effect', () => {
    for (const p of policies) {
      expect(String(p.issued_date ?? ''), String(p.title)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(p.issued_date) <= String(p.effective_date), String(p.title)).toBe(true);
    }
  });
});

describe('the seeded attachments', () => {
  it('hang under 差旅费报销管理办法 itself: a table with text and a form without', () => {
    expect(attachments.map((d) => [d.label, d.sort_no, d.has_text, d.has_images])).toEqual([
      ['附件1', 1, true, false],
      ['附件2', 2, false, true],
    ]);
    expect(attachments.every((d) => d.policy === '差旅费报销管理办法')).toBe(true);
    for (const d of attachments) {
      expect(d).not.toHaveProperty('policy_version');
      expect(d).not.toHaveProperty('attachment_class');
      expect(d).not.toHaveProperty('is_current');
    }
    expect(attachments[1].body_md).toBeUndefined();
  });
});

describe('the token estimate', () => {
  it('rounds characters / CHARS_PER_TOKEN up, counting code points', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('一二三')).toBe(Math.ceil(3 / CHARS_PER_TOKEN));
    expect(countChars('𠀀a')).toBe(2);
  });
});
