import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BrightRuleSeedData } from '../seed.js';
import { CHARS_PER_TOKEN, countChars, estimateTokens, type ArticleIndexEntry } from '../document-text.js';

type Row = Record<string, unknown>;

const rows = (object: string) => (BrightRuleSeedData.find((s) => s.object === object)?.records ?? []) as Row[];
const documents = rows('brightrule_policy_document');
const versions = rows('brightrule_policy_version');
const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('the seeded version documents', () => {
  it('give every version exactly one body, current exactly when the version is', () => {
    for (const v of versions) {
      const bodies = documents.filter((d) => d.policy_version === v.title && d.doc_kind === 'body');
      expect(bodies, String(v.title)).toHaveLength(1);
      expect(bodies[0].sort_no).toBe(0);
      expect(bodies[0].is_current).toBe(v.version_status === 'current');
    }
  });

  it("index every clause of the version at the offsets where the body holds it", () => {
    const clauses = rows('brightrule_clause');
    for (const d of documents.filter((x) => x.doc_kind === 'body')) {
      const body = Array.from(String(d.body_md_redacted));
      const index = d.article_index as ArticleIndexEntry[];
      const ownClauses = clauses.filter((c) => c.policy_version === d.policy_version);
      expect(index.map((e) => e.article)).toEqual(ownClauses.map((c) => String(c.citation).split(' ').pop()));
      index.forEach((entry, i) => {
        const span = body.slice(...entry.redacted).join('');
        expect(span.startsWith(`**${entry.article}**`)).toBe(true);
        expect(span.endsWith(String(ownClauses[i].content))).toBe(true);
      });
    }
  });

  it('count characters and estimate tokens from the stored text', () => {
    for (const d of documents) {
      const text = d.body_md_redacted as string | undefined;
      expect(d.has_text).toBe(Boolean(text));
      expect(d.text_chars).toBe(text ? countChars(text) : 0);
      expect(d.text_tokens).toBe(text ? Math.ceil(countChars(text) / CHARS_PER_TOKEN) : 0);
    }
  });

  it('carry a synthetic original whose SHA-256 is the content hash', () => {
    for (const d of documents) {
      const ref = d.original_file as { $file: string };
      const bytes = readFileSync(packageRoot + ref.$file);
      expect(bytes.toString('utf8').startsWith('【合成示例原件】')).toBe(true);
      expect(d.content_hash, ref.$file).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('include a normative and a form attachment on 差旅费报销管理办法 V3.0', () => {
    const attachments = documents.filter((d) => d.doc_kind === 'attachment');
    expect(attachments.map((d) => [d.attachment_class, d.sort_no, d.has_text])).toEqual([
      ['normative', 1, true],
      ['form', 2, false],
    ]);
    expect(attachments.every((d) => d.policy_version === '差旅费报销管理办法 V3.0')).toBe(true);
    expect(attachments[1].body_md_redacted).toBeUndefined();
  });
});

describe('the token estimate', () => {
  it('rounds characters / CHARS_PER_TOKEN up, counting code points', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('一二三')).toBe(Math.ceil(3 / CHARS_PER_TOKEN));
    expect(countChars('𠀀a')).toBe(2);
  });
});
