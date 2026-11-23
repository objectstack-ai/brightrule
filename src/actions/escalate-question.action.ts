import { defineAction } from '@objectstack/spec/ui';

/**
 * 转人工 — hand a question the policies cannot answer to the policy office.
 *
 * Exposed to the `ask` agent (as `action_brightrule_escalate_question`) so the
 * policy-inquiry skill can log a question it found no current clause for. It
 * records the question as a `brightrule_question` flagged 需转人工, which puts
 * it in the 「待人工答复」 list.
 *
 * The body is sandboxed metadata (no in-process code), so it runs on a hosted
 * environment. It writes `answer` itself: an inquiry saved with an answer is
 * left as written by the answer hook, so the escalated question is not
 * answered automatically a second time.
 */
export const EscalateQuestionAction = defineAction({
  name: 'brightrule_escalate_question',
  label: '转人工',
  icon: 'user-round-check',
  type: 'script',
  params: [
    { name: 'question', label: '问题', type: 'textarea', required: true },
    { name: 'context', label: '补充说明', type: 'textarea' },
  ],
  body: {
    language: 'js',
    source:
      "var q = String(ctx.input.question || '').trim();" +
      "if (!q) { return { ok: false, message: '问题不能为空' }; }" +
      "var note = String(ctx.input.context || '').trim();" +
      "var row = await ctx.api.object('brightrule_question').insert({" +
      "  question: q.slice(0, 500)," +
      "  status: 'open'," +
      "  needs_human: true," +
      "  answer_source: 'ai'," +
      "  answer: '现行制度中未找到明确依据，已转归口部门人工答复。' + (note ? '\\n补充说明：' + note : '')" +
      "});" +
      "return { ok: true, questionId: row && row.id };",
    capabilities: ['api.write'],
  },
  successMessage: '已转人工，归口部门答复后会更新在「待人工答复」中。',
  locations: [],
  refreshAfter: false,
  ai: {
    exposed: true,
    description:
      'Hand an employee policy question to a person when no current policy clause answers it, or when the employee asks for a human. Pass the question in the employee\'s own words; put what you already checked in context. Never use it for a question you answered with a cited clause.',
  },
});
