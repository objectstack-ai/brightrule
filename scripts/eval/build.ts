#!/usr/bin/env -S npx tsx
/**
 * Write the synthetic evaluation set to files the driver and the grader read:
 *
 *   npx tsx scripts/eval/build.ts [--distractors N] [--seed S] [--out DIR]
 *
 * DIR (default scripts/eval/generated/, git-ignored) gets corpus.json and
 * questions.json. The same arguments give the same bytes: the distractors
 * come from a fixed-seed generator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './corpus/index.js';
import { DEFAULT_DISTRACTORS, DISTRACTOR_SEED } from './corpus/distractors.js';
import { buildQuestionSet } from './questions/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name: string, def: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};

const distractors = Number(flag('--distractors', String(DEFAULT_DISTRACTORS)));
const seed = Number(flag('--seed', String(DISTRACTOR_SEED)));
const out = path.resolve(flag('--out', path.join(HERE, 'generated')));

const corpus = buildCorpus({ distractors, seed });
const questions = buildQuestionSet();
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'corpus.json'), `${JSON.stringify(corpus, null, 1)}\n`);
fs.writeFileSync(path.join(out, 'questions.json'), `${JSON.stringify(questions, null, 1)}\n`);
const core = corpus.policies.filter((p) => p.origin !== 'distractor');
console.log(
  `corpus ${corpus.version}: ${corpus.units.length} units, ${corpus.personas.length} personas, ` +
    `${core.length} core policies (${core.filter((p) => p.lang === 'zh').length} zh, ${core.filter((p) => p.lang === 'en').length} en), ` +
    `${corpus.policies.length - core.length} distractors → ${path.relative(process.cwd(), out)}/corpus.json`,
);
console.log(`questions ${questions.version}: ${questions.questions.length} → ${path.relative(process.cwd(), out)}/questions.json`);
