/**
 * The synthetic question set: Chinese (about 250) plus the English sample.
 */
import { CORPUS_VERSION } from '../corpus/index.js';
import { QuestionSet } from '../schema.js';
import { EN_QUESTIONS } from './en.js';
import { ZH_QUESTIONS } from './zh.js';

export const QUESTION_SET_VERSION = 'synthetic-2026-11-28';

export function buildQuestionSet(): QuestionSet {
  return QuestionSet.parse({
    version: QUESTION_SET_VERSION,
    corpus: CORPUS_VERSION,
    questions: [...ZH_QUESTIONS, ...EN_QUESTIONS],
  });
}
