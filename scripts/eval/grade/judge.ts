/**
 * The blind model judge (brightrule#69 §5: 答案要点模型盲评). It sees the
 * question, who asked, the reference points and the answer — never which
 * model, route or configuration produced the answer — and returns 2 / 1 / 0
 * on the same scale as the 2026-11-26 online run.
 *
 * Only the interface, the prompt and the parser live here; the caller (any
 * OpenAI-compatible chat API) is `openAiJudge`, used by the grade script when
 * a judge endpoint is configured.
 */
import { z } from 'zod';
import type { Persona, Question } from '../schema.js';

export interface JudgeInput {
  question: Question;
  persona: Persona;
  unitName?: string;
  answer: string;
  /** The first reply, when the answer came after an automatic clarify reply. */
  clarifyText?: string;
}

export const JudgeVerdict = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  points: z.array(z.boolean()),
  reason: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdict>;

export type Judge = (input: JudgeInput) => Promise<JudgeVerdict>;

export const JUDGE_SYSTEM = `你是制度问答的评分员。你会看到员工的问题、提问人信息、参考要点和一份答复。只按参考要点评分，不要用你自己的常识补充或否定参考要点。你不知道答复是哪个系统或模型写的，也不要猜。

评分（0 / 1 / 2）：
- 2 = 正确：结论与参考要点一致，关键数字、条件、审批人都对；要点全部覆盖或只缺无关紧要的细节。
- 1 = 部分正确：结论方向对，但漏了重要条件、只答了一部分，或夹带了一处不影响结论的错误。
- 0 = 错误：结论错、数字错、用了不适用的制度（如其他平级公司、草稿、已废止或限定范围的制度）、该说「未找到依据」却给出了具体做法，或该答却拒答。

特别规则：
- 参考要点说「未找到相关规定」时，答复明确说没有依据、且没有编造或借用其他公司的具体做法，给 2。
- 参考要点要求「先列出各档再问」或「问一次在哪家公司」时，看答复是否做到；如果给了两段（反问 + 回答后），按最终答复评分，反问是否得当写进 reason。
- 答复语言应与提问语言一致；语言不一致最多给 1。
- 只输出一个 JSON 对象，不要输出其他文字：{"score": 0|1|2, "points": [每条参考要点是否覆盖，true/false], "reason": "一两句话"}`;

/** The user message of the judge call. */
export function buildJudgePrompt(input: JudgeInput): string {
  const q = input.question;
  const who = input.unitName ? `${input.persona.self_description}（系统登记的所属单位：${input.unitName}）` : `${input.persona.self_description}（系统里没有登记所属单位）`;
  const lines = [
    `## 提问人`,
    who,
    ``,
    ...(q.context_turns.length ? [`## 之前的对话（提问人说过）`, ...q.context_turns.map((t) => `- ${t}`), ``] : []),
    `## 问题（${q.question_lang === 'zh' ? '中文' : '英文'}）`,
    q.question,
    ``,
    `## 参考要点`,
    ...q.answer_points.map((p, i) => `${i + 1}. ${p}`),
    ...(q.key_values.length ? [``, `关键数值：${q.key_values.map((k) => k.value).join('、')}`] : []),
    ...(q.expect_no_basis ? [``, `本题的正确答复是「未找到相关规定」（或不披露限定范围制度的内容）。`] : []),
    ...(q.should_clarify ? [``, `本题应先反问一次（单位或职级），提问人回答后再作答。`] : []),
    ``,
    ...(input.clarifyText ? [`## 答复（第一段：反问）`, input.clarifyText, ``, `## 答复（第二段：提问人回答后）`] : [`## 答复`]),
    input.answer,
  ];
  return lines.join('\n');
}

/** Parse the judge's reply: the first JSON object in it, validated. */
export function parseJudgeVerdict(text: string, pointCount: number): JudgeVerdict {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`judge reply has no JSON object: ${text.slice(0, 200)}`);
  const v = JudgeVerdict.parse(JSON.parse(text.slice(start, end + 1)));
  if (v.points.length !== pointCount) {
    // A judge that miscounts still gave a score; pad or trim the point list so the shape stays stable.
    v.points = Array.from({ length: pointCount }, (_, i) => v.points[i] ?? false);
  }
  return v;
}

/**
 * A judge over an OpenAI-compatible chat completions API.
 *   JUDGE_BASE_URL (e.g. https://ai-gateway.vercel.sh/v1), JUDGE_API_KEY, JUDGE_MODEL
 */
export function openAiJudge(opts: { baseUrl: string; apiKey: string; model: string }): Judge {
  return async (input) => {
    const r = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM },
          { role: 'user', content: buildJudgePrompt(input) },
        ],
      }),
    });
    if (!r.ok) throw new Error(`judge HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { choices: Array<{ message: { content: string } }> };
    return parseJudgeVerdict(j.choices[0]?.message?.content ?? '', input.question.answer_points.length);
  };
}

/**
 * A judge run by the Claude Code CLI (`JUDGE_BACKEND=claude-cli`, `JUDGE_MODEL`
 * an alias such as `sonnet`): one `claude -p` per answer, no tools, on the CLI
 * account's own plan instead of an API key.
 */
export function claudeCliJudge(opts: { model: string }): Judge {
  return async (input) => {
    const { spawn } = await import('node:child_process');
    const os = await import('node:os');
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn('claude', ['-p', buildJudgePrompt(input), '--model', opts.model, '--system-prompt', JUDGE_SYSTEM, '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands', '--output-format', 'json'], { cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => {
        try {
          const j = JSON.parse(out) as { result?: string; is_error?: boolean };
          if (j.is_error || !j.result) reject(new Error(`judge claude: ${(j.result ?? err).slice(0, 200)}`));
          else resolve(j.result);
        } catch {
          reject(new Error(`judge claude exited ${code}: ${(err || out).slice(0, 200)}`));
        }
      });
    });
    return parseJudgeVerdict(text, input.question.answer_points.length);
  };
}
