#!/usr/bin/env -S npx tsx
/**
 * Grade run records (one JSON object per line, the RunRecord format in
 * schema.ts) against a question set and its corpus, and print the report.
 *
 *   npx tsx scripts/eval/grade.ts RECORDS.jsonl [--questions FILE] [--corpus FILE] [--out REPORT.json] [--md REPORT.md]
 *
 * Questions and corpus default to scripts/eval/generated/ (run build.ts
 * first); a set kept outside the repository is passed by path. Records of
 * several configurations in one file are reported per configuration.
 *
 * The blind judge runs when JUDGE_BASE_URL, JUDGE_API_KEY and JUDGE_MODEL are
 * set; otherwise only the rules grade, and questions without a checkable
 * value score 0 — the report says the judge did not run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusIndex } from './grade/corpus-index.js';
import { openAiJudge, type Judge } from './grade/judge.js';
import { aggregate, reportMarkdown, type Graded } from './grade/metrics.js';
import { finalScore, gradeRecord } from './grade/rules.js';
import { Corpus, QuestionSet, RunRecord } from './schema.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name: string, def?: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const recordsPath = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!recordsPath) throw new Error('usage: grade.ts RECORDS.jsonl [--questions FILE] [--corpus FILE] [--out FILE] [--md FILE]');

const questions = QuestionSet.parse(JSON.parse(fs.readFileSync(flag('--questions', path.join(HERE, 'generated/questions.json'))!, 'utf8')));
const corpus = Corpus.parse(JSON.parse(fs.readFileSync(flag('--corpus', path.join(HERE, 'generated/corpus.json'))!, 'utf8')));
const records = fs.readFileSync(recordsPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => RunRecord.parse(JSON.parse(l)));

const idx = corpusIndex(corpus);
const qById = new Map(questions.questions.map((q) => [q.id, q]));
const personaById = new Map(corpus.personas.map((p) => [p.id, p]));
const judge: Judge | null =
  process.env.JUDGE_BASE_URL && process.env.JUDGE_API_KEY && process.env.JUDGE_MODEL
    ? openAiJudge({ baseUrl: process.env.JUDGE_BASE_URL, apiKey: process.env.JUDGE_API_KEY, model: process.env.JUDGE_MODEL })
    : null;

const graded: Graded[] = [];
for (const rec of records) {
  const q = qById.get(rec.question);
  if (!q) throw new Error(`record for unknown question ${rec.question}`);
  const rule = gradeRecord(q, rec, idx);
  let j: 0 | 1 | 2 | null = null;
  if (judge && !rec.error) {
    const persona = personaById.get(q.persona)!;
    try {
      j = (await judge({ question: q, persona, unitName: persona.unit ? idx.unitName(persona.unit) : undefined, answer: rec.answer, clarifyText: rec.clarify_text })).score;
    } catch (err) {
      console.error(`judge failed on ${q.id} rep ${rec.rep}: ${(err as Error).message}`);
    }
  }
  graded.push({ rule, judge: j, score: finalScore(rule, j), record: rec, question: q });
}

const configs = [...new Set(graded.map((g) => g.record.config))];
const reports = configs.map((c) => aggregate(c, graded.filter((g) => g.record.config === c)));
const md = [`Judge: ${judge ? process.env.JUDGE_MODEL : 'not run (rules only)'}.`, '', ...reports.map(reportMarkdown)].join('\n');
console.log(md);
const out = flag('--out');
if (out) fs.writeFileSync(out, `${JSON.stringify({ reports, graded: graded.map((g) => ({ ...g.rule, judge: g.judge, score: g.score })) }, null, 1)}\n`);
const mdOut = flag('--md');
if (mdOut) fs.writeFileSync(mdOut, md);
