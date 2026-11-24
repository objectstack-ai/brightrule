import { describe, it, expect } from 'vitest';
import type { ClauseCandidate } from '../answer.js';
import { NOT_FOUND_ANSWER } from '../answer.js';
import { buildJudgeMessages, DISCLAIMER, judgeAnswer, parseJudgement, type ChatService } from '../judge.js';

const candidates: ClauseCandidate[] = [
  { id: 'k11', title: '宴请标准', citation: '《示例接待办法》V1.0 第十一条', content: '甲类客户宴请每人每次不超过 300 元。', score: 0.72 },
  { id: 'k8', title: '公务接待', citation: '《示例接待办法》V1.0 第八条', content: '公务接待按上级文件执行。', score: 0.41 },
  { id: 'k18', title: '内部宴请', citation: '《示例接待办法》V1.0 第十八条', content: '内部单位之间不安排宴请。', score: 0.38 },
];

/** A model that answers with the given text and records what it was sent. */
function model(reply: string | (() => Promise<{ content: string }>)) {
  const sent: unknown[] = [];
  const ai: ChatService = {
    async chat(messages) {
      sent.push(messages);
      return typeof reply === 'string' ? { content: reply } : reply();
    },
  };
  return { ai, sent };
}

describe('judging an inquiry from the retrieved clauses', () => {
  it('shows the model every candidate by label, with its citation and text', () => {
    const [system, user] = buildJudgeMessages('内部单位之间能互相宴请吗？', candidates);
    expect(system.role).toBe('system');
    expect(user.content).toContain('C3\n出处：《示例接待办法》V1.0 第十八条\n原文：内部单位之间不安排宴请。');
  });

  it('answers from the clause the model cites, not from the top retrieval hit', async () => {
    const { ai } = model('{"verdict":"answered","answer":"不能。内部单位之间不安排宴请（《示例接待办法》V1.0 第十八条）。","cited":["C3"]}');
    const a = await judgeAnswer(ai, '内部单位之间能互相宴请吗？', candidates);
    expect(a?.status).toBe('answered');
    expect(a?.cited_clause).toBe('k18');
    expect(a?.needs_human).toBe(false);
    expect(a?.answer).toContain('第十八条');
    expect(a?.answer.endsWith(DISCLAIMER)).toBe(true);
    expect(a?.match_score).toBe(0.38);
  });

  it('keeps the other cited clauses as references', async () => {
    const { ai } = model('{"verdict":"answered","answer":"……","cited":["C1","C2"]}');
    const a = await judgeAnswer(ai, 'q', candidates);
    expect(a?.cited_clause).toBe('k11');
    expect(a?.other_references).toBe('《示例接待办法》V1.0 第八条：公务接待按上级文件执行。');
  });

  it('routes a partial answer to a person while still telling the asker what is known', async () => {
    const { ai } = model('{"verdict":"partial","answer":"本办法未定公务接待标准，按上级文件执行（第八条）。","cited":["C2"]}');
    const a = await judgeAnswer(ai, '公务接待的宴请标准是多少？', candidates);
    expect(a?.status).toBe('open');
    expect(a?.needs_human).toBe(true);
    expect(a?.cited_clause).toBe('k8');
    expect(a?.answer).toContain('按上级文件执行');
  });

  it('reports no basis as not found', async () => {
    const { ai } = model('{"verdict":"no_basis","answer":"现行条款中没有找到相关规定。","cited":[]}');
    const a = await judgeAnswer(ai, '年度接待预算是多少？', candidates);
    expect(a?.answer).toBe(NOT_FOUND_ANSWER);
    expect(a?.needs_human).toBe(true);
    expect(a?.cited_clause).toBeNull();
  });

  it('reads JSON wrapped in a code fence or prose', () => {
    const j = parseJudgement('好的：\n```json\n{"verdict":"answered","answer":"x","cited":["c1"]}\n```', candidates);
    expect(j?.cited).toEqual(['k11']);
  });

  it('discards a citation outside the candidates it was shown', () => {
    expect(parseJudgement('{"verdict":"answered","answer":"x","cited":["C9"]}', candidates)).toBeNull();
  });

  it('discards an answer that cites nothing, an unknown verdict, and non-JSON', () => {
    expect(parseJudgement('{"verdict":"answered","answer":"x","cited":[]}', candidates)).toBeNull();
    expect(parseJudgement('{"verdict":"maybe","answer":"x","cited":["C1"]}', candidates)).toBeNull();
    expect(parseJudgement('我认为答案是 500 元', candidates)).toBeNull();
  });

  it('gives up on an error, a timeout or an unusable reply, so the caller falls back', async () => {
    expect(await judgeAnswer(model(async () => { throw new Error('down'); }).ai, 'q', candidates)).toBeNull();
    expect(await judgeAnswer(model(() => new Promise(() => {})).ai, 'q', candidates, 20)).toBeNull();
    expect(await judgeAnswer(model('无法判断').ai, 'q', candidates)).toBeNull();
    expect(await judgeAnswer(model('{}').ai, 'q', [])).toBeNull();
  });
});
