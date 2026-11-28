/** Lookups the grader needs over a corpus (synthetic or a redacted one kept outside the repository). */
import type { Corpus } from '../schema.js';
import type { CorpusIndex } from './rules.js';

export function corpusIndex(corpus: Corpus): CorpusIndex {
  const byKey = new Map(corpus.policies.map((p) => [p.key, p]));
  const unitName = new Map(corpus.units.map((u) => [u.code, u.name]));
  const titleCount = new Map<string, number>();
  for (const p of corpus.policies) titleCount.set(p.title, (titleCount.get(p.title) ?? 0) + 1);
  return {
    policy: (key) => byKey.get(key),
    unitName: (code) => unitName.get(code) ?? code,
    titleIsUnique: (title) => titleCount.get(title) === 1,
  };
}
