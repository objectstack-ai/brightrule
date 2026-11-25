import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BrightRuleSeedData } from '../seed.js';
import { CHARS_PER_TOKEN, countChars, estimateTokens, type ArticleIndexEntry } from '../document-text.js';

type Row = Record<string, unknown>;

const rows = (object: string) => (BrightRuleSeedData.find((s) => s.object === object)?.records ?? []) as Row[];
const attachments = rows('brightrule_policy_attachment');
const versions = rows('brightrule_policy_version');
/** The body originals: a second, update-only dataset on the version object. */
const versionOriginals = (BrightRuleSeedData.filter((s) => s.object === 'brightrule_policy_version')[1]?.records ?? []) as Row[];
const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('the seeded version bodies', () => {
  it('give every version a body', () => {
    for (const v of versions) expect(String(v.body_md ?? ''), String(v.title)).not.toBe('');
  });

  it("index every clause of the version at the offsets where the body holds it", () => {
    const clauses = rows('brightrule_clause');
    for (const v of versions) {
      const body = Array.from(String(v.body_md));
      const index = v.article_index as ArticleIndexEntry[];
      const ownClauses = clauses.filter((c) => c.policy_version === v.title);
      expect(index.map((e) => e.article)).toEqual(ownClauses.map((c) => String(c.citation).split(' ').pop()));
      index.forEach((entry, i) => {
        const span = body.slice(...entry.redacted).join('');
        expect(span.startsWith(`**${entry.article}**`)).toBe(true);
        expect(span.endsWith(String(ownClauses[i].content))).toBe(true);
      });
    }
  });

  it('count characters and estimate tokens from the stored text', () => {
    for (const row of [...versions, ...attachments]) {
      const text = row.body_md as string | undefined;
      if ('has_text' in row) expect(row.has_text).toBe(Boolean(text));
      expect(row.text_chars).toBe(text ? countChars(text) : 0);
      expect(row.text_tokens).toBe(text ? Math.ceil(countChars(text) / CHARS_PER_TOKEN) : 0);
    }
  });

  it('carry a synthetic original whose SHA-256 is the content hash, one per version', () => {
    expect(versionOriginals.map((o) => o.title)).toEqual(versions.map((v) => v.title));
    for (const v of versions) expect(v).not.toHaveProperty('original_file');
    for (const row of [...versionOriginals, ...attachments]) {
      const ref = row.original_file as { $file: string };
      const bytes = readFileSync(packageRoot + ref.$file);
      expect(bytes.toString('utf8').startsWith('【合成示例原件】')).toBe(true);
      expect(row.content_hash, ref.$file).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('do not seed the policy pointer: the version hook sets it', () => {
    for (const p of rows('brightrule_policy')) expect(p).not.toHaveProperty('current_version');
  });
});

describe('the seeded attachments', () => {
  it('are a normative and a form attachment on 差旅费报销管理办法 V3.0, current with it', () => {
    expect(attachments.map((d) => [d.attachment_class, d.sort_no, d.has_text, d.is_current])).toEqual([
      ['normative', 1, true, true],
      ['form', 2, false, true],
    ]);
    expect(attachments.every((d) => d.policy_version === '差旅费报销管理办法 V3.0')).toBe(true);
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
