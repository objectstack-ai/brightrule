/**
 * Where the embedded chunks live. The adapter owns chunking and embedding;
 * a store only keeps rows and answers nearest-neighbour queries, so the same
 * adapter runs against process memory or a pgvector table unchanged.
 */

/** One embedded chunk of a knowledge document. */
export interface VectorRecord {
  /** `${documentId}#${chunkIndex}` — unique within a source. */
  chunkId: string;
  sourceId: string;
  documentId: string;
  sourceRecordId?: string;
  title?: string;
  /** The chunk text a hit returns as its snippet. */
  content: string;
  metadata: Record<string, unknown>;
  /** Hash of (model, embedded text): equal hash ⇒ the stored vector is still right. */
  contentHash: string;
  /** Embedder that produced `vector` (`<embedder id>:<dimensions>`). */
  model: string;
  /** Unit-length embedding. */
  vector: number[];
}

export interface VectorMatch {
  record: VectorRecord;
  /** Cosine similarity, 1 = identical direction. */
  score: number;
}

export interface VectorSearchQuery {
  sourceId: string;
  vector: number[];
  topK: number;
  /** Equality filter on metadata keys; every pair must match. */
  filter?: Record<string, unknown>;
}

export interface VectorStore {
  /** `memory` or `pgvector` — reported in logs and health checks. */
  readonly kind: string;
  /** Prepare storage for vectors of this many dimensions. Idempotent. */
  init(dimensions: number): Promise<void>;
  /** The stored hash of each chunk id of a document that has one. */
  chunkHashes(sourceId: string, documentId: string): Promise<Map<string, string>>;
  /** Insert or replace the given chunks. */
  upsert(records: VectorRecord[]): Promise<void>;
  /** Replace every metadata/snippet field of a stored chunk without touching its vector. */
  updateWithoutVector(records: Omit<VectorRecord, 'vector'>[]): Promise<void>;
  /** Remove chunks of these documents whose chunk id is not in `keep`. */
  deleteDocuments(sourceId: string, documentIds: string[], keep?: Set<string>): Promise<void>;
  search(query: VectorSearchQuery): Promise<VectorMatch[]>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
  close?(): Promise<void>;
}

/** Scale a vector to unit length (zero vectors are returned unchanged). */
export function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  return n === 0 ? v : v.map((x) => x / n);
}

/** Dot product of two unit vectors = their cosine similarity. */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

/** Every filter pair equals the metadata value (booleans compared loosely to 0/1). */
export function matchesFilter(metadata: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    const m = metadata[k];
    if (typeof v === 'boolean' && (m === 0 || m === 1)) {
      if (Boolean(m) !== v) return false;
    } else if (m !== v) {
      return false;
    }
  }
  return true;
}
