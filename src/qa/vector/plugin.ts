import type { Plugin, PluginContext } from '@objectstack/core';
import {
  EMBEDDER_SERVICE,
  KNOWLEDGE_SERVICE,
  type IEmbedder,
  type IKnowledgeService,
} from '@objectstack/spec/contracts';
import { OpenAIEmbedder } from '@objectstack/embedder-openai';
import { VectorKnowledgeAdapter } from './adapter.js';
import { readVectorEnv } from './env.js';
import { MemoryVectorStore } from './memory-store.js';
import { PgVectorStore } from './pgvector-store.js';
import type { VectorStore } from './vector-store.js';

export interface KnowledgeVectorPluginOptions {
  /** Adapter id a knowledge source names in `adapter`. @default 'vector' */
  id?: string;
  /** Embedder to use; otherwise the kernel's `embedder` service, then `OS_KNOWLEDGE_EMBEDDING_*`. */
  embedder?: IEmbedder;
  /** Store to use; otherwise the one `OS_KNOWLEDGE_VECTOR_STORE` names. */
  store?: VectorStore;
  /** Environment to read (tests). @default process.env */
  env?: Record<string, string | undefined>;
}

/**
 * Registers the `vector` knowledge adapter with the host's knowledge service.
 *
 * The store is chosen by `OS_KNOWLEDGE_VECTOR_STORE` (`memory` | `pgvector`),
 * so one build runs with in-process vectors in development and a pgvector
 * table in production — see `env.ts` for every variable.
 *
 * Without an embedder the adapter is NOT registered, and the boot says so: a
 * source bound to `vector` then reports its adapter missing on every search
 * instead of quietly returning nothing.
 */
export class KnowledgeVectorPlugin implements Plugin {
  name = 'com.objectstack.plugin.knowledge-vector';
  version = '0.1.0';
  type = 'standard' as const;
  dependencies = ['com.objectstack.service.knowledge'];

  private adapter: VectorKnowledgeAdapter | undefined;
  private store: VectorStore | undefined;

  constructor(private readonly opts: KnowledgeVectorPluginOptions = {}) {}

  async init(_ctx: PluginContext): Promise<void> {}

  async start(ctx: PluginContext): Promise<void> {
    const env = readVectorEnv(this.opts.env ?? process.env);

    let embedder = this.opts.embedder;
    if (!embedder) {
      try {
        embedder = ctx.getService<IEmbedder>(EMBEDDER_SERVICE);
      } catch {
        // no kernel embedder — fall through to the environment
      }
    }
    if (!embedder && env.embedding) {
      embedder = new OpenAIEmbedder({
        apiKey: env.embedding.apiKey,
        model: env.embedding.model,
        baseUrl: env.embedding.baseUrl,
        dimensions: env.embedding.dimensions,
        id: env.embedding.model,
      });
    }
    if (!embedder) {
      ctx.logger.error?.(
        "KnowledgeVectorPlugin: no embedder — the 'vector' knowledge adapter is not registered. " +
          'Set OS_KNOWLEDGE_EMBEDDING_MODEL, OS_KNOWLEDGE_EMBEDDING_API_KEY and OS_KNOWLEDGE_EMBEDDING_BASE_URL, ' +
          "or register an 'embedder' service.",
      );
      return;
    }

    this.store =
      this.opts.store ??
      (env.store === 'pgvector'
        ? new PgVectorStore({ connectionString: env.pgvector!.connectionString, table: env.pgvector!.table })
        : new MemoryVectorStore());
    this.adapter = new VectorKnowledgeAdapter({
      id: this.opts.id,
      embedder,
      store: this.store,
      queryPrefix: env.queryPrefix,
    });

    let svc: IKnowledgeService;
    try {
      svc = ctx.getService<IKnowledgeService>(KNOWLEDGE_SERVICE);
    } catch {
      ctx.logger.warn?.('KnowledgeVectorPlugin: IKnowledgeService not registered — install KnowledgeServicePlugin first.');
      return;
    }
    svc.registerAdapter(this.adapter.id, this.adapter);
    ctx.logger.info?.(
      `KnowledgeVectorPlugin: adapter '${this.adapter.id}' registered — store=${this.store.kind}, ` +
        `embedder=${embedder.id} (${embedder.dimensions} dims).`,
    );
  }

  async destroy(): Promise<void> {
    await this.store?.close?.();
  }
}
