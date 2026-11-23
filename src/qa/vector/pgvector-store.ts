import type { VectorMatch, VectorRecord, VectorSearchQuery, VectorStore } from './vector-store.js';

/** pgvector's HNSW index takes vectors of at most this many dimensions. */
const HNSW_MAX_DIMENSIONS = 2000;

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export interface PgVectorStoreOptions {
  /** `postgres://user:pass@host:5432/db` */
  connectionString: string;
  /** Table holding the chunks. @default 'os_knowledge_vectors' */
  table?: string;
  /** Pool size. @default 5 */
  maxConnections?: number;
}

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  end: () => Promise<void>;
};

/**
 * PostgreSQL + pgvector store. Chunks persist across restarts, so an unchanged
 * chunk is never embedded twice (the adapter compares `content_hash` first),
 * and search runs in the database through an HNSW cosine index.
 *
 * One table serves every source (`source_id` column). The vector column is
 * sized on first use; a later boot with an embedder of another size is refused
 * rather than mixing vectors that cannot be compared — point `table` at a new
 * table, or drop the old one to rebuild.
 */
export class PgVectorStore implements VectorStore {
  readonly kind = 'pgvector';
  private readonly table: string;
  private pool: PgPool | undefined;

  constructor(private readonly opts: PgVectorStoreOptions) {
    this.table = opts.table ?? 'os_knowledge_vectors';
    if (!IDENTIFIER.test(this.table)) {
      throw new Error(
        `PgVectorStore: table name '${this.table}' is not a plain lowercase SQL identifier ` +
          '(letters, digits and underscores, starting with a letter or underscore).',
      );
    }
    if (!opts.connectionString) throw new Error('PgVectorStore: connectionString required');
  }

  async init(dimensions: number): Promise<void> {
    const pool = await this.getPool();
    const t = this.table;
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${t} (
         source_id        text        NOT NULL,
         chunk_id         text        NOT NULL,
         document_id      text        NOT NULL,
         source_record_id text,
         title            text,
         content          text        NOT NULL,
         metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
         content_hash     text        NOT NULL,
         model            text        NOT NULL,
         embedding        vector(${dimensions}) NOT NULL,
         updated_at       timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (source_id, chunk_id)
       )`,
    );
    const { rows } = await pool.query(
      `SELECT atttypmod AS dims FROM pg_attribute WHERE attrelid = $1::regclass AND attname = 'embedding'`,
      [t],
    );
    const stored = Number(rows[0]?.dims);
    if (stored !== dimensions) {
      throw new Error(
        `PgVectorStore: table '${t}' holds ${stored}-dimension vectors but the embedder produces ${dimensions}. ` +
          'Vectors of different sizes cannot be compared. Set OS_KNOWLEDGE_PGVECTOR_TABLE to a new table ' +
          `for this embedder, or drop '${t}' so it is rebuilt.`,
      );
    }
    await pool.query(`CREATE INDEX IF NOT EXISTS ${t}_doc_idx ON ${t} (source_id, document_id)`);
    if (dimensions <= HNSW_MAX_DIMENSIONS) {
      await pool.query(`CREATE INDEX IF NOT EXISTS ${t}_hnsw_idx ON ${t} USING hnsw (embedding vector_cosine_ops)`);
    }
  }

  async chunkHashes(sourceId: string, documentId: string): Promise<Map<string, string>> {
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `SELECT chunk_id, content_hash FROM ${this.table} WHERE source_id = $1 AND document_id = $2`,
      [sourceId, documentId],
    );
    return new Map(rows.map((r) => [String(r.chunk_id), String(r.content_hash)]));
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const pool = await this.getPool();
    for (const r of records) {
      await pool.query(
        `INSERT INTO ${this.table}
           (source_id, chunk_id, document_id, source_record_id, title, content, metadata, content_hash, model, embedding, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::vector, now())
         ON CONFLICT (source_id, chunk_id) DO UPDATE SET
           document_id = EXCLUDED.document_id, source_record_id = EXCLUDED.source_record_id,
           title = EXCLUDED.title, content = EXCLUDED.content, metadata = EXCLUDED.metadata,
           content_hash = EXCLUDED.content_hash, model = EXCLUDED.model,
           embedding = EXCLUDED.embedding, updated_at = now()`,
        [
          r.sourceId, r.chunkId, r.documentId, r.sourceRecordId ?? null, r.title ?? null, r.content,
          JSON.stringify(r.metadata ?? {}), r.contentHash, r.model, toVectorLiteral(r.vector),
        ],
      );
    }
  }

  async updateWithoutVector(records: Omit<VectorRecord, 'vector'>[]): Promise<void> {
    if (records.length === 0) return;
    const pool = await this.getPool();
    for (const r of records) {
      await pool.query(
        `UPDATE ${this.table} SET source_record_id = $3, title = $4, content = $5, metadata = $6::jsonb, updated_at = now()
          WHERE source_id = $1 AND chunk_id = $2`,
        [r.sourceId, r.chunkId, r.sourceRecordId ?? null, r.title ?? null, r.content, JSON.stringify(r.metadata ?? {})],
      );
    }
  }

  async deleteDocuments(sourceId: string, documentIds: string[], keep?: Set<string>): Promise<void> {
    if (documentIds.length === 0) return;
    const pool = await this.getPool();
    await pool.query(
      `DELETE FROM ${this.table} WHERE source_id = $1 AND document_id = ANY($2::text[]) AND NOT (chunk_id = ANY($3::text[]))`,
      [sourceId, documentIds, [...(keep ?? [])]],
    );
  }

  async search(query: VectorSearchQuery): Promise<VectorMatch[]> {
    const pool = await this.getPool();
    const values: unknown[] = [toVectorLiteral(query.vector), query.sourceId, query.topK];
    const conditions: string[] = ['source_id = $2'];
    for (const [key, value] of Object.entries(query.filter ?? {})) {
      // A boolean may arrive stored as true/false or as 1/0, depending on the driver
      // the source records came from; both spellings match.
      const accepted = typeof value === 'boolean' ? (value ? ['true', '1'] : ['false', '0']) : [String(value)];
      values.push(key, accepted);
      conditions.push(`(metadata ->> $${values.length - 1}) = ANY($${values.length}::text[])`);
    }
    const { rows } = await pool.query(
      `SELECT source_id, chunk_id, document_id, source_record_id, title, content, metadata, content_hash, model,
              1 - (embedding <=> $1::vector) AS score
         FROM ${this.table}
        WHERE ${conditions.join(' AND ')}
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      values,
    );
    return rows.map((r) => ({
      score: Number(r.score),
      record: {
        sourceId: String(r.source_id),
        chunkId: String(r.chunk_id),
        documentId: String(r.document_id),
        sourceRecordId: r.source_record_id == null ? undefined : String(r.source_record_id),
        title: r.title == null ? undefined : String(r.title),
        content: String(r.content),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        contentHash: String(r.content_hash),
        model: String(r.model),
        vector: [],
      },
    }));
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const pool = await this.getPool();
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${this.table}`);
      return { ok: true, message: `pgvector store '${this.table}': ${rows[0]?.n ?? 0} chunk(s)` };
    } catch (err) {
      return { ok: false, message: `pgvector store '${this.table}': ${(err as Error).message}` };
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
  }

  private async getPool(): Promise<PgPool> {
    if (this.pool) return this.pool;
    let pg: { Pool: new (cfg: Record<string, unknown>) => PgPool } | undefined;
    try {
      const mod = (await import('pg')) as unknown as { default?: typeof pg; Pool?: unknown };
      pg = (mod.default ?? mod) as typeof pg;
    } catch {
      throw new Error(
        "PgVectorStore: the 'pg' package is not installed. The pgvector store needs it: add 'pg' to the host app's dependencies.",
      );
    }
    this.pool = new pg!.Pool({ connectionString: this.opts.connectionString, max: this.opts.maxConnections ?? 5 });
    return this.pool;
  }
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
