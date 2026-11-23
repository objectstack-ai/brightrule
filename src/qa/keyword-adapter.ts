import type { Plugin, PluginContext } from '@objectstack/core';
import {
  KNOWLEDGE_SERVICE,
  type AdapterContext,
  type AdapterSearchOptions,
  type IKnowledgeAdapter,
  type IKnowledgeService,
} from '@objectstack/spec/contracts';
import type { KnowledgeDocument, KnowledgeHit } from '@objectstack/spec/ai';

/**
 * Keyword retrieval with no embedding model — the fallback when
 * `OS_KNOWLEDGE_EMBEDDING_MODEL` is unset, for demos and tests.
 *
 * The published `@objectstack/knowledge-memory` (18.6.0) splits text on
 * non-alphanumerics, so a whole Chinese sentence becomes one term and a
 * Chinese question almost never matches. This adapter indexes a CJK run as its
 * overlapping character bigrams instead (「住宿标准」 → 住宿 · 宿标 · 标准) and
 * scores by cosine similarity of term counts. It matches wording, not
 * meaning: 「滴滴」 does not find 「网约车」. Production uses the `vector`
 * adapter (`src/qa/vector/`).
 */

const CJK_RUN = /[一-鿿]+/g;

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const terms = lower.replace(CJK_RUN, ' ').split(/[^a-z0-9]+/i).filter((t) => t.length > 1);
  for (const run of lower.match(CJK_RUN) ?? []) {
    if (run.length === 1) terms.push(run);
    else for (let i = 0; i < run.length - 1; i++) terms.push(run.slice(i, i + 2));
  }
  return terms;
}

interface Entry {
  doc: KnowledgeDocument;
  vec: Map<string, number>;
  norm: number;
}

function vectorOf(text: string): { vec: Map<string, number>; norm: number } {
  const vec = new Map<string, number>();
  for (const t of tokenize(text)) vec.set(t, (vec.get(t) ?? 0) + 1);
  let s = 0;
  for (const x of vec.values()) s += x * x;
  return { vec, norm: Math.sqrt(s) };
}

export class KeywordKnowledgeAdapter implements IKnowledgeAdapter {
  readonly id = 'keyword';
  /** sourceId → documentId → entry */
  private readonly store = new Map<string, Map<string, Entry>>();

  async upsert(docs: KnowledgeDocument[], ctx: AdapterContext): Promise<void> {
    let bucket = this.store.get(ctx.source.id);
    if (!bucket) this.store.set(ctx.source.id, (bucket = new Map()));
    for (const doc of docs) bucket.set(doc.id, { doc, ...vectorOf(doc.content) });
  }

  async delete(documentIds: string[], ctx: AdapterContext): Promise<void> {
    const bucket = this.store.get(ctx.source.id);
    for (const id of documentIds) bucket?.delete(id);
  }

  async search(query: string, opts: AdapterSearchOptions): Promise<KnowledgeHit[]> {
    const q = vectorOf(query);
    if (q.norm === 0) return [];
    const hits: KnowledgeHit[] = [];
    for (const { doc, vec, norm } of this.store.get(opts.source.id)?.values() ?? []) {
      if (norm === 0) continue;
      let dot = 0;
      for (const [t, n] of q.vec) dot += n * (vec.get(t) ?? 0);
      if (dot === 0) continue;
      hits.push({
        chunkId: `${doc.id}#0`,
        documentId: doc.id,
        sourceId: opts.source.id,
        sourceRecordId: doc.sourceRecordId,
        score: dot / (q.norm * norm),
        snippet: doc.content,
        title: doc.title,
        metadata: doc.metadata,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, opts.topK ?? 5);
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true };
  }
}

/** Registers the `keyword` adapter with the knowledge service. */
export class KeywordKnowledgePlugin implements Plugin {
  name = 'ai.objectstack.brightrule.knowledge-keyword';
  version = '0.1.0';
  type = 'standard' as const;
  dependencies = ['com.objectstack.service.knowledge'];

  async init(_ctx: PluginContext): Promise<void> {}

  async start(ctx: PluginContext): Promise<void> {
    const svc = ctx.getService<IKnowledgeService>(KNOWLEDGE_SERVICE);
    const adapter = new KeywordKnowledgeAdapter();
    svc.registerAdapter(adapter.id, adapter);
  }
}
