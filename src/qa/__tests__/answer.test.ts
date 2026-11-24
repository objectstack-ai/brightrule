import { describe, it, expect } from 'vitest';
import { KeywordKnowledgeAdapter } from '../keyword-adapter.js';
import { recordToDocument } from '@objectstack/service-knowledge';
import type { ObjectKnowledgeSource } from '@objectstack/spec/ai';
import { composeReferenceAnswer, MIN_ANSWER_SCORE, NOT_FOUND_ANSWER, REFERENCE_INTRO } from '../answer.js';
import { policyClauseKnowledgeSource } from '../knowledge-source.js';
import { BrightRuleSeedData } from '../../data/seed.js';

type Row = Record<string, unknown>;

/** The seeded clauses, given ids, indexed the way the knowledge service indexes them. */
async function indexSeededClauses() {
  const seed = BrightRuleSeedData.find((s) => s.object === 'brightrule_clause');
  const rows: Row[] = (seed?.records ?? []).map((r, i) => ({ ...(r as Row), id: `c${i}` }));
  const adapter = new KeywordKnowledgeAdapter();
  const source = policyClauseKnowledgeSource('keyword');
  const docs = rows.map((r) => recordToDocument(source, source.source as ObjectKnowledgeSource, r));
  await adapter.upsert(docs, { source });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    /** Retrieve and keep current clauses (the hook's read-back cut), best first. */
    async candidates(question: string) {
      const hits = await adapter.search(question, { source, topK: 10 });
      const candidates = hits
        .map((h) => ({ hit: h, row: byId.get(h.sourceRecordId!)! }))
        .filter(({ row }) => row.is_current === true)
        .map(({ hit, row }) => ({
          id: String(row.id),
          title: String(row.title),
          citation: String(row.citation),
          content: String(row.content),
          score: hit.score,
        }));
      return candidates.sort((a, b) => b.score - a.score);
    },
    /** The no-model fallback the hook falls back to. */
    async fallback(question: string) {
      return composeReferenceAnswer(await this.candidates(question));
    },
  };
}

describe('policy inquiry retrieval', () => {
  it('ranks the current clause that answers first', async () => {
    const kb = await indexSeededClauses();
    const [best] = await kb.candidates('去上海出差，酒店住宿标准是多少？');
    expect(best.citation).toBe('《差旅费报销管理办法》V3.0 第五条');
  });

  it('never hands a superseded version to the answer', async () => {
    const kb = await indexSeededClauses();
    const found = await kb.candidates('一线城市住宿标准每晚多少元');
    expect(found.map((c) => c.citation)).not.toContain('《差旅费报销管理办法》V2.0 第五条');
  });

  it('ranks across policies', async () => {
    const kb = await indexSeededClauses();
    expect((await kb.candidates('我工作满8年，年休假有几天？'))[0].citation).toContain('第十二条');
    expect((await kb.candidates('客户送了300元的礼品可以收吗'))[0].citation).toContain('第七条');
    expect((await kb.candidates('能用外部AI工具翻译内部文件吗'))[0].citation).toContain('第九条');
  });
});

describe('the no-model fallback', () => {
  it('lists references for a person and never presents them as the answer', async () => {
    const kb = await indexSeededClauses();
    const a = await kb.fallback('去上海出差，酒店住宿标准是多少？');
    expect(a.status).toBe('open');
    expect(a.needs_human).toBe(true);
    expect(a.cited_clause).toBeNull();
    expect(a.answer.startsWith(REFERENCE_INTRO)).toBe(true);
    expect(a.answer).toContain('《差旅费报销管理办法》V3.0 第五条');
  });

  it('reports an unanswerable question as not found', async () => {
    const kb = await indexSeededClauses();
    const a = await kb.fallback('公司年会在哪里举办？');
    expect(a.status).toBe('open');
    expect(a.needs_human).toBe(true);
    expect(a.answer).toBe(NOT_FOUND_ANSWER);
  });

  it('lists nothing below the threshold', () => {
    const a = composeReferenceAnswer([{ id: 'x', title: 't', citation: 'c', content: 'body', score: MIN_ANSWER_SCORE / 2 }]);
    expect(a.answer).toBe(NOT_FOUND_ANSWER);
  });
});
