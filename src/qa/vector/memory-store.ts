import { dot, matchesFilter, type VectorMatch, type VectorRecord, type VectorSearchQuery, type VectorStore } from './vector-store.js';

/**
 * Process-memory vector store: exact (brute-force) cosine search.
 *
 * Nothing survives a restart. That is the intended trade for this store: the
 * knowledge index is derived data, and an `object` source is rebuilt from its
 * records at boot (`IKnowledgeService.reindexSource`). Exact search over a few
 * thousand 1024-dimension chunks takes single-digit milliseconds; past tens of
 * thousands of chunks, choose `pgvector`.
 */
export class MemoryVectorStore implements VectorStore {
  readonly kind = 'memory';
  /** sourceId → chunkId → record */
  private readonly sources = new Map<string, Map<string, VectorRecord>>();
  private dimensions = 0;

  async init(dimensions: number): Promise<void> {
    if (this.dimensions && this.dimensions !== dimensions) {
      // Vectors of two sizes cannot be compared; start over rather than mix them.
      this.sources.clear();
    }
    this.dimensions = dimensions;
  }

  async chunkHashes(sourceId: string, documentId: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const r of this.sources.get(sourceId)?.values() ?? []) {
      if (r.documentId === documentId) out.set(r.chunkId, r.contentHash);
    }
    return out;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const r of records) this.bucket(r.sourceId).set(r.chunkId, r);
  }

  async updateWithoutVector(records: Omit<VectorRecord, 'vector'>[]): Promise<void> {
    for (const r of records) {
      const bucket = this.bucket(r.sourceId);
      const existing = bucket.get(r.chunkId);
      if (existing) bucket.set(r.chunkId, { ...r, vector: existing.vector });
    }
  }

  async deleteDocuments(sourceId: string, documentIds: string[], keep?: Set<string>): Promise<void> {
    const bucket = this.sources.get(sourceId);
    if (!bucket) return;
    const docs = new Set(documentIds);
    for (const [chunkId, r] of bucket) {
      if (docs.has(r.documentId) && !keep?.has(chunkId)) bucket.delete(chunkId);
    }
  }

  async search(query: VectorSearchQuery): Promise<VectorMatch[]> {
    const matches: VectorMatch[] = [];
    for (const record of this.sources.get(query.sourceId)?.values() ?? []) {
      if (!matchesFilter(record.metadata, query.filter)) continue;
      matches.push({ record, score: dot(query.vector, record.vector) });
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, query.topK);
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    let n = 0;
    for (const b of this.sources.values()) n += b.size;
    return { ok: true, message: `memory store: ${n} chunk(s)` };
  }

  private bucket(sourceId: string): Map<string, VectorRecord> {
    let b = this.sources.get(sourceId);
    if (!b) {
      b = new Map();
      this.sources.set(sourceId, b);
    }
    return b;
  }
}
