/**
 * The synthetic evaluation corpus: units, personas, the Chinese core (with the
 * dev seed's ten policies), the English sample and the generated distractors.
 */
import { Corpus } from '../schema.js';
import type { BuiltPolicy } from './build-policy.js';
import { coreEn } from './core-en.js';
import { coreZh } from './core-zh.js';
import { DEFAULT_DISTRACTORS, DISTRACTOR_SEED, distractorUnits, distractors } from './distractors.js';
import { CORE_UNITS, PERSONAS } from './units.js';

export const CORPUS_VERSION = 'synthetic-2026-11-28';

export interface CorpusOptions {
  /** How many distractor policies (0 for the core only). */
  distractors?: number;
  seed?: number;
}

/** The core policies with their fact → article maps (what questions resolve against). */
export function corePolicies(): BuiltPolicy[] {
  return [...coreZh(), ...coreEn()];
}

export function buildCorpus(opts: CorpusOptions = {}): Corpus {
  const n = opts.distractors ?? DEFAULT_DISTRACTORS;
  return Corpus.parse({
    version: CORPUS_VERSION,
    units: [...CORE_UNITS, ...(n > 0 ? distractorUnits() : [])],
    personas: PERSONAS,
    policies: [...corePolicies().map((b) => b.policy), ...distractors(n, opts.seed ?? DISTRACTOR_SEED)],
  });
}

/** Resolve a fact id of a core policy to its article number; throws on a typo, so a question never points nowhere. */
export function articleResolver(): (policy: string, fact: string) => string {
  const byKey = new Map(corePolicies().map((b) => [b.policy.key, b]));
  return (policy, fact) => {
    const b = byKey.get(policy);
    if (!b) throw new Error(`no core policy ${policy}`);
    if (/^附件|^Appendix/.test(fact)) {
      if (!b.policy.attachments.some((a) => a.label === fact)) throw new Error(`${policy} has no ${fact}`);
      return fact;
    }
    const a = b.articles[fact];
    if (!a) throw new Error(`${policy} has no fact ${fact} (has ${Object.keys(b.articles).join(', ')})`);
    return a;
  };
}
