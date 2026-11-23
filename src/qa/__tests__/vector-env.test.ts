import { describe, expect, it } from 'vitest';
import { readVectorEnv } from '../vector/env.js';

describe('readVectorEnv', () => {
  it('defaults to the memory store with no embedder', () => {
    expect(readVectorEnv({})).toEqual({ store: 'memory' });
  });

  it('selects pgvector and requires its connection string', () => {
    expect(() => readVectorEnv({ OS_KNOWLEDGE_VECTOR_STORE: 'pgvector' })).toThrow(/OS_KNOWLEDGE_PGVECTOR_URL/);
    expect(
      readVectorEnv({
        OS_KNOWLEDGE_VECTOR_STORE: 'PgVector',
        OS_KNOWLEDGE_PGVECTOR_URL: 'postgres://u:p@h/db',
        OS_KNOWLEDGE_PGVECTOR_TABLE: 'kb_vectors',
      }),
    ).toEqual({ store: 'pgvector', pgvector: { connectionString: 'postgres://u:p@h/db', table: 'kb_vectors' } });
  });

  it('refuses a store it does not have, naming the ones it does', () => {
    expect(() => readVectorEnv({ OS_KNOWLEDGE_VECTOR_STORE: 'qdrant' })).toThrow(/memory, pgvector/);
  });

  it('reads the embedding model and requires its key', () => {
    expect(() => readVectorEnv({ OS_KNOWLEDGE_EMBEDDING_MODEL: 'BAAI/bge-m3' })).toThrow(/OS_KNOWLEDGE_EMBEDDING_API_KEY/);
    expect(
      readVectorEnv({
        OS_KNOWLEDGE_EMBEDDING_MODEL: 'BAAI/bge-m3',
        OS_KNOWLEDGE_EMBEDDING_API_KEY: 'k',
        OS_KNOWLEDGE_EMBEDDING_BASE_URL: 'https://api.siliconflow.cn/v1',
        OS_KNOWLEDGE_EMBEDDING_DIMENSIONS: '1024',
        OS_KNOWLEDGE_EMBEDDING_QUERY_PREFIX: '为这个句子生成表示以用于检索相关文章：',
      }),
    ).toEqual({
      store: 'memory',
      embedding: { model: 'BAAI/bge-m3', apiKey: 'k', baseUrl: 'https://api.siliconflow.cn/v1', dimensions: 1024 },
      queryPrefix: '为这个句子生成表示以用于检索相关文章：',
    });
  });

  it('refuses dimensions that are not a positive whole number', () => {
    expect(() =>
      readVectorEnv({ OS_KNOWLEDGE_EMBEDDING_MODEL: 'm', OS_KNOWLEDGE_EMBEDDING_API_KEY: 'k', OS_KNOWLEDGE_EMBEDDING_DIMENSIONS: '1.5' }),
    ).toThrow(/positive whole number/);
  });
});
