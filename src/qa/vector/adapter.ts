import { createHash } from 'node:crypto';
import type {
  AdapterContext,
  AdapterSearchOptions,
  IEmbedder,
  IKnowledgeAdapter,
} from '@objectstack/spec/contracts';
import type { KnowledgeDocument, KnowledgeHit } from '@objectstack/spec/ai';
import { normalize, type VectorRecord, type VectorStore } from './vector-store.js';

/** A chunk past this many characters is split on paragraph boundaries. */
const CHUNK_TARGET = 1200;
/** Texts per embedding request. */
const EMBED_BATCH = 16;

export interface VectorKnowledgeAdapterOptions {
  /** Adapter id a knowledge source names in `adapter`. @default 'vector' */
  id?: string;
  embedder: IEmbedder;
  store: VectorStore;
  /**
   * Text put before every QUERY (never before a document) — some embedding
   * models are trained asymmetrically and expect one, e.g. the BGE family's
   * `为这个句子生成表示以用于检索相关文章：`.
   */
  queryPrefix?: string;
}

/**
 * Semantic retrieval: each document is split into chunks, each chunk is
 * embedded once, and a query is answered by cosine similarity between its
 * embedding and the chunks'.
 *
 * Re-embedding is driven by content, not by events: a chunk whose text (and
 * embedder) is unchanged keeps its vector, and only its metadata is rewritten.
 * A record update that flips a status field therefore costs no embedding call.
 */
export class VectorKnowledgeAdapter implements IKnowledgeAdapter {
  readonly id: string;
  private readonly embedder: IEmbedder;
  private readonly store: VectorStore;
  private readonly queryPrefix: string;
  private readonly model: string;
  private ready: Promise<void> | undefined;

  constructor(opts: VectorKnowledgeAdapterOptions) {
    this.id = opts.id ?? 'vector';
    this.embedder = opts.embedder;
    this.store = opts.store;
    this.queryPrefix = opts.queryPrefix ?? '';
    this.model = `${opts.embedder.id}:${opts.embedder.dimensions}`;
  }

  /** Store kind, for logs. */
  get storeKind(): string {
    return this.store.kind;
  }

  async upsert(docs: KnowledgeDocument[], ctx: AdapterContext): Promise<void> {
    await this.init();
    const sourceId = ctx.source.id;
    const toEmbed: Array<Omit<VectorRecord, 'vector'> & { text: string }> = [];
    const metadataOnly: Array<Omit<VectorRecord, 'vector'>> = [];

    for (const doc of docs) {
      const stored = await this.store.chunkHashes(sourceId, doc.id);
      const keep = new Set<string>();
      chunk(doc.content).forEach((content, idx) => {
        const text = doc.title && !content.includes(doc.title) ? `${doc.title}\n${content}` : content;
        const row = {
          chunkId: `${doc.id}#${idx}`,
          sourceId,
          documentId: doc.id,
          sourceRecordId: doc.sourceRecordId,
          title: doc.title,
          content,
          metadata: doc.metadata ?? {},
          contentHash: hash(`${this.model}\n${text}`),
          model: this.model,
        };
        keep.add(row.chunkId);
        if (stored.get(row.chunkId) === row.contentHash) metadataOnly.push(row);
        else toEmbed.push({ ...row, text });
      });
      // A document that shrank drops the chunks it no longer has.
      await this.store.deleteDocuments(sourceId, [doc.id], keep);
    }

    await this.store.updateWithoutVector(metadataOnly);
    for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
      const batch = toEmbed.slice(i, i + EMBED_BATCH);
      const vectors = await this.embedder.embed(batch.map((b) => b.text));
      await this.store.upsert(batch.map(({ text: _text, ...row }, j) => ({ ...row, vector: normalize(vectors[j]) })));
    }
  }

  async search(query: string, opts: AdapterSearchOptions): Promise<KnowledgeHit[]> {
    await this.init();
    if (!query.trim()) return [];
    const [qv] = await this.embedder.embed([`${this.queryPrefix}${query}`]);
    const matches = await this.store.search({
      sourceId: opts.source.id,
      vector: normalize(qv),
      topK: opts.topK ?? 5,
      filter: opts.filter as Record<string, unknown> | undefined,
    });
    return matches.map(({ record, score }) => ({
      chunkId: record.chunkId,
      documentId: record.documentId,
      sourceId: record.sourceId,
      sourceRecordId: record.sourceRecordId,
      score,
      snippet: record.content,
      title: record.title,
      metadata: record.metadata,
    }));
  }

  async delete(documentIds: string[], ctx: AdapterContext): Promise<void> {
    await this.init();
    await this.store.deleteDocuments(ctx.source.id, documentIds);
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.init();
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
    const store = await this.store.healthCheck();
    return { ok: store.ok, message: `embedder ${this.model}; ${store.message ?? ''}`.trim() };
  }

  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.store.init(this.embedder.dimensions).catch((err) => {
        this.ready = undefined; // let a later call retry once the cause is fixed
        throw err;
      });
    }
    return this.ready;
  }
}

/** Paragraph-boundary chunks of at most ~CHUNK_TARGET characters. */
export function chunk(content: string): string[] {
  const text = content.trim();
  if (text.length <= CHUNK_TARGET) return text ? [text] : [];
  const out: string[] = [];
  let buf = '';
  for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (buf && buf.length + para.length + 2 > CHUNK_TARGET) {
      out.push(buf);
      buf = '';
    }
    if (para.length > CHUNK_TARGET) {
      for (let i = 0; i < para.length; i += CHUNK_TARGET) out.push(para.slice(i, i + CHUNK_TARGET));
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
