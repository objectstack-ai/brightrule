import { afterAll, describe, expect, it } from 'vitest';
import type { IEmbedder } from '@objectstack/spec/contracts';
import type { KnowledgeDocument, KnowledgeSource } from '@objectstack/spec/ai';
import { VectorKnowledgeAdapter, chunk } from '../vector/adapter.js';
import { MemoryVectorStore } from '../vector/memory-store.js';
import { PgVectorStore } from '../vector/pgvector-store.js';
import type { VectorStore } from '../vector/vector-store.js';

/**
 * Deterministic stand-in for an embedding model: character bigrams hashed into
 * 128 buckets. Texts that share wording land close together, which is all the
 * store and adapter mechanics under test need. It counts the texts it embeds.
 */
class FakeEmbedder implements IEmbedder {
  readonly id = 'fake';
  readonly dimensions = 128;
  calls = 0;
  embedded = 0;
  async embed(texts: string[]): Promise<number[][]> {
    this.calls++;
    this.embedded += texts.length;
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0);
      const s = t.toLowerCase();
      for (let i = 0; i < s.length - 1; i++) {
        const code = s.charCodeAt(i) * 31 + s.charCodeAt(i + 1);
        v[code % this.dimensions] += 1;
      }
      return v;
    });
  }
}

const source = {
  id: 'clauses',
  label: 'Clauses',
  adapter: 'vector',
  source: { kind: 'object', object: 'policy_clause', contentFields: ['content'] },
} as KnowledgeSource;

const docs: KnowledgeDocument[] = [
  { id: 'lodging', sourceId: 'clauses', sourceRecordId: 'r1', title: '住宿标准', content: '一线城市住宿标准为每晚不超过 600 元，其他城市不超过 400 元。', metadata: { is_current: true } },
  { id: 'meal', sourceId: 'clauses', sourceRecordId: 'r2', title: '伙食补贴', content: '出差伙食补贴每人每天 100 元，不再另行报销餐费。', metadata: { is_current: true } },
  { id: 'leave', sourceId: 'clauses', sourceRecordId: 'r3', title: '年休假', content: '员工累计工作满 1 年不满 10 年的，年休假 5 天。', metadata: { is_current: 1 } },
  { id: 'old', sourceId: 'clauses', sourceRecordId: 'r4', title: '住宿标准（旧）', content: '一线城市住宿标准为每晚不超过 500 元。', metadata: { is_current: false } },
];

const pgUrl = process.env.OS_TEST_PGVECTOR_URL;
const stores: Array<[string, () => VectorStore]> = [['memory', () => new MemoryVectorStore()]];
if (pgUrl) {
  let n = 0;
  stores.push(['pgvector', () => new PgVectorStore({ connectionString: pgUrl, table: `os_kv_test_${process.pid}_${n++}` })]);
}
const opened: VectorStore[] = [];
afterAll(async () => {
  for (const s of opened) {
    if (s instanceof PgVectorStore) {
      const t = (s as unknown as { table: string }).table;
      await (s as unknown as { getPool(): Promise<{ query(q: string): Promise<unknown> }> })
        .getPool()
        .then((p) => p.query(`DROP TABLE IF EXISTS ${t}`));
    }
    await s.close?.();
  }
});

describe.each(stores)('VectorKnowledgeAdapter over the %s store', (_kind, makeStore) => {
  function setup() {
    const store = makeStore();
    opened.push(store);
    const embedder = new FakeEmbedder();
    const adapter = new VectorKnowledgeAdapter({ embedder, store });
    return { adapter, embedder, store };
  }

  it('returns the closest chunk first, with record id and metadata', async () => {
    const { adapter } = setup();
    await adapter.upsert(docs, { source });
    const hits = await adapter.search('其他城市住宿标准是不是 400 元', { source, topK: 3 });
    expect(hits[0].documentId).toBe('lodging');
    expect(hits[0].sourceRecordId).toBe('r1');
    expect(hits[0].snippet).toContain('600 元');
    expect(hits[0].score).toBeGreaterThan(hits[hits.length - 1].score);
  });

  it('filters on metadata, matching a boolean stored as 1/0 too', async () => {
    const { adapter } = setup();
    await adapter.upsert(docs, { source });
    const hits = await adapter.search('一线城市住宿标准', { source, topK: 10, filter: { is_current: true } });
    const ids = hits.map((h) => h.documentId);
    expect(ids).not.toContain('old');
    expect(ids).toContain('leave'); // stored as 1
  });

  it('does not re-embed unchanged text; a metadata-only change is written without embedding', async () => {
    const { adapter, embedder } = setup();
    await adapter.upsert(docs, { source });
    const before = embedder.embedded;
    const flipped = docs.map((d) => (d.id === 'old' ? { ...d, metadata: { is_current: true } } : d));
    await adapter.upsert(flipped, { source });
    expect(embedder.embedded).toBe(before);
    const hits = await adapter.search('一线城市住宿标准', { source, topK: 10, filter: { is_current: true } });
    expect(hits.map((h) => h.documentId)).toContain('old');
  });

  it('re-embeds a chunk whose text changed', async () => {
    const { adapter, embedder } = setup();
    await adapter.upsert(docs, { source });
    const before = embedder.embedded;
    await adapter.upsert([{ ...docs[0], content: '一线城市住宿标准为每晚不超过 700 元。' }], { source });
    expect(embedder.embedded).toBe(before + 1);
    const [hit] = await adapter.search('住宿标准', { source, topK: 1, filter: { is_current: true } });
    expect(hit.documentId).toBe('lodging');
    expect(hit.snippet).toContain('700 元');
  });

  it('drops the chunks a shrinking document no longer has, and deletes documents', async () => {
    const { adapter } = setup();
    const long: KnowledgeDocument = {
      id: 'long', sourceId: 'clauses', content: ['甲'.repeat(1000), '乙'.repeat(1000), '丙'.repeat(1000)].join('\n\n'),
    };
    await adapter.upsert([long], { source });
    expect((await adapter.search('甲乙丙', { source, topK: 10 })).length).toBe(3);
    await adapter.upsert([{ ...long, content: '甲'.repeat(10) }], { source });
    expect((await adapter.search('甲乙丙', { source, topK: 10 })).length).toBe(1);
    await adapter.delete(['long'], { source });
    expect(await adapter.search('甲乙丙', { source, topK: 10 })).toEqual([]);
  });

  it('keeps sources apart', async () => {
    const { adapter } = setup();
    await adapter.upsert(docs, { source });
    const other = { ...source, id: 'other' } as KnowledgeSource;
    expect(await adapter.search('住宿标准', { source: other, topK: 5 })).toEqual([]);
  });
});

describe('chunk', () => {
  it('keeps a short text whole and splits a long one on paragraphs', () => {
    expect(chunk('一条条款')).toEqual(['一条条款']);
    const parts = chunk(['a'.repeat(700), 'b'.repeat(700)].join('\n\n'));
    expect(parts).toHaveLength(2);
    expect(chunk('   ')).toEqual([]);
  });
});
