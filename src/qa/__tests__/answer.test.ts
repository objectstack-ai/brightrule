import { describe, it, expect } from 'vitest';
import { KeywordKnowledgeAdapter } from '../keyword-adapter.js';
import { recordToDocument } from '@objectstack/service-knowledge';
import type { ObjectKnowledgeSource } from '@objectstack/spec/ai';
import { composeAnswer, MIN_ANSWER_SCORE, NOT_FOUND_ANSWER } from '../answer.js';
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
    /** Retrieve, keep current clauses (the hook's read-back cut), compose. */
    async ask(question: string) {
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
      return composeAnswer(candidates);
    },
  };
}

describe('policy inquiry answers', () => {
  it('answers from the current clause and cites it', async () => {
    const kb = await indexSeededClauses();
    const a = await kb.ask('去上海出差，酒店住宿标准是多少？');
    expect(a.status).toBe('answered');
    expect(a.answer).toContain('《差旅费报销管理办法》V3.0 第五条');
    expect(a.answer).toContain('600 元');
    expect(a.needs_human).toBe(false);
  });

  it('never quotes a superseded version', async () => {
    const kb = await indexSeededClauses();
    const a = await kb.ask('一线城市住宿标准每晚多少元');
    expect(a.answer).not.toContain('500 元');
    expect(a.answer).not.toContain('V2.0');
  });

  it('answers across policies', async () => {
    const kb = await indexSeededClauses();
    expect((await kb.ask('我工作满8年，年休假有几天？')).answer).toContain('第十二条');
    expect((await kb.ask('客户送了300元的礼品可以收吗')).answer).toContain('第七条');
    expect((await kb.ask('能用外部AI工具翻译内部文件吗')).answer).toContain('第九条');
  });

  it('routes an unanswerable question to a person', async () => {
    const kb = await indexSeededClauses();
    const a = await kb.ask('公司年会在哪里举办？');
    expect(a.status).toBe('open');
    expect(a.needs_human).toBe(true);
    expect(a.answer).toBe(NOT_FOUND_ANSWER);
    expect(a.cited_clause).toBeNull();
  });

  it('refuses to quote below the threshold', () => {
    const a = composeAnswer([{ id: 'x', title: 't', citation: 'c', content: 'body', score: MIN_ANSWER_SCORE / 2 }]);
    expect(a.needs_human).toBe(true);
  });
});
