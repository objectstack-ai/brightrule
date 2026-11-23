/**
 * Configuration read from the environment. One variable picks where the
 * vectors live; the embedding model is configured beside it.
 *
 * | Variable                              | Meaning                                                      |
 * |---------------------------------------|--------------------------------------------------------------|
 * | `OS_KNOWLEDGE_VECTOR_STORE`           | `memory` (default) or `pgvector`                             |
 * | `OS_KNOWLEDGE_PGVECTOR_URL`           | Postgres connection string — required for `pgvector`         |
 * | `OS_KNOWLEDGE_PGVECTOR_TABLE`         | Table name (default `os_knowledge_vectors`)                  |
 * | `OS_KNOWLEDGE_EMBEDDING_BASE_URL`     | OpenAI-compatible `/v1` endpoint (OpenAI, DashScope, 智谱, SiliconFlow, Ollama …) |
 * | `OS_KNOWLEDGE_EMBEDDING_MODEL`        | Model id, e.g. `BAAI/bge-m3`, `text-embedding-v3`            |
 * | `OS_KNOWLEDGE_EMBEDDING_API_KEY`      | Bearer key for that endpoint                                 |
 * | `OS_KNOWLEDGE_EMBEDDING_DIMENSIONS`   | Vector size, when the model is not one the embedder knows    |
 * | `OS_KNOWLEDGE_EMBEDDING_QUERY_PREFIX` | Text put before every query (asymmetric models, e.g. BGE)    |
 *
 * An embedder registered in the kernel (`embedder` service) takes precedence
 * over the `OS_KNOWLEDGE_EMBEDDING_*` variables.
 */

export type VectorStoreKind = 'memory' | 'pgvector';

export interface VectorEnvConfig {
  store: VectorStoreKind;
  pgvector?: { connectionString: string; table?: string };
  /** Present when the environment names an embedding model. */
  embedding?: { baseUrl?: string; model: string; apiKey: string; dimensions?: number };
  queryPrefix?: string;
}

const STORES: readonly VectorStoreKind[] = ['memory', 'pgvector'];

/**
 * Read and validate the configuration. A value that cannot work is refused
 * with the variable to fix, at boot, rather than surfacing as an empty search.
 */
export function readVectorEnv(env: Record<string, string | undefined> = process.env): VectorEnvConfig {
  const rawStore = (env.OS_KNOWLEDGE_VECTOR_STORE ?? '').trim().toLowerCase() || 'memory';
  if (!STORES.includes(rawStore as VectorStoreKind)) {
    throw new Error(
      `OS_KNOWLEDGE_VECTOR_STORE='${env.OS_KNOWLEDGE_VECTOR_STORE}' is not a vector store this adapter has. ` +
        `Use one of: ${STORES.join(', ')}.`,
    );
  }
  const store = rawStore as VectorStoreKind;
  const config: VectorEnvConfig = { store };

  if (store === 'pgvector') {
    const connectionString = env.OS_KNOWLEDGE_PGVECTOR_URL?.trim();
    if (!connectionString) {
      throw new Error(
        'OS_KNOWLEDGE_VECTOR_STORE=pgvector needs OS_KNOWLEDGE_PGVECTOR_URL — the Postgres connection string ' +
          'of a database with the pgvector extension available (postgres://user:pass@host:5432/db).',
      );
    }
    config.pgvector = { connectionString, table: env.OS_KNOWLEDGE_PGVECTOR_TABLE?.trim() || undefined };
  }

  const model = env.OS_KNOWLEDGE_EMBEDDING_MODEL?.trim();
  if (model) {
    const apiKey = env.OS_KNOWLEDGE_EMBEDDING_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        `OS_KNOWLEDGE_EMBEDDING_MODEL='${model}' needs OS_KNOWLEDGE_EMBEDDING_API_KEY — the key for ` +
          'OS_KNOWLEDGE_EMBEDDING_BASE_URL (a local endpoint that takes no key accepts any non-empty value).',
      );
    }
    const rawDims = env.OS_KNOWLEDGE_EMBEDDING_DIMENSIONS?.trim();
    const dimensions = rawDims ? Number(rawDims) : undefined;
    if (rawDims && (!Number.isInteger(dimensions) || (dimensions as number) <= 0)) {
      throw new Error(`OS_KNOWLEDGE_EMBEDDING_DIMENSIONS='${rawDims}' is not a positive whole number.`);
    }
    config.embedding = {
      baseUrl: env.OS_KNOWLEDGE_EMBEDDING_BASE_URL?.trim() || undefined,
      model,
      apiKey,
      dimensions,
    };
  }
  const prefix = env.OS_KNOWLEDGE_EMBEDDING_QUERY_PREFIX;
  if (prefix) config.queryPrefix = prefix;
  return config;
}
