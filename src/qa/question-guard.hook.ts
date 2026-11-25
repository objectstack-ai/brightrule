import { defineHook, type HookContext } from '@objectstack/spec/data';

/**
 * Lower runs first (the engine sorts a write's hooks by ascending `priority`;
 * a hook that declares none runs at 100). The answer hook
 * (`question-answer.hook.ts`) declares none, so this guard strips a forged
 * answer BEFORE the answer hook looks at the payload: the answer hook skips a
 * question saved with an answer, and must not be fooled into skipping by one.
 */
export const QUESTION_GUARD_PRIORITY = 50;

/**
 * The answer-class fields of an inquiry: what the system or the in-product AI
 * writes, never the person asking. Kept here for tests and the design note;
 * the handler below repeats the list inline so it stays lowerable.
 */
export const GUARDED_ANSWER_FIELDS = [
  'answer',
  'answer_redacted',
  'basis',
  'basis_md',
  'answer_route',
  'run_info',
  'answer_source',
  'match_score',
  'status',
  'cited_clause',
  'other_references',
] as const;

/**
 * 防伪造 — an inquiry's answer is never typed by a person (brightrule#27).
 *
 * On every insert and update of `brightrule_question`, the answer-class fields
 * ({@link GUARDED_ANSWER_FIELDS}) are removed from the payload unless the
 * write is one of:
 *
 *   - a system write (`ctx.session.isSystem`): seed replay, an action body
 *     (an action body runs as system — the escalate action among them), a
 *     hook or flow declared `runAs: 'system'`;
 *   - a write the in-product AI performed for the signed-in person
 *     (`ctx.provenance.performedByAgentId`, which only the server-constructed
 *     in-product AI path stamps; never a request header or model output).
 *
 * Everything else — a person's own REST / form / import write, an external AI
 * client over MCP (`performedByClientId`), a write with no identity at all —
 * is stripped. Strip, not refuse: the question itself is still saved, and on
 * insert the answer hook then answers it as for any new question.
 *
 * Fields not listed (the question, the scope, `needs_human`) pass untouched.
 * `scope_kind` is not listed because the scope hook always re-derives it.
 *
 * The handler names nothing outside itself, so `os build` lowers it to a
 * metadata-only body; a lowered body receives `ctx.session` and
 * `ctx.provenance` as the in-process handler does.
 */
export const QuestionGuardHook = defineHook({
  name: 'brightrule_question_answer_guard',
  object: 'brightrule_question',
  events: ['beforeInsert', 'beforeUpdate'],
  priority: QUESTION_GUARD_PRIORITY,
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. A question has no field named `data`.
    const input = ctx.input as Record<string, unknown> | undefined;
    const nested = input?.data;
    const data = (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : input) as
      | Record<string, unknown>
      | undefined;
    if (!data) return;
    if (ctx.session?.isSystem === true) return;
    const agentId = ctx.provenance?.performedByAgentId;
    if (typeof agentId === 'string' && agentId !== '') return;
    const guarded = [
      'answer',
      'answer_redacted',
      'basis',
      'basis_md',
      'answer_route',
      'run_info',
      'answer_source',
      'match_score',
      'status',
      'cited_clause',
      'other_references',
    ];
    for (const field of guarded) {
      if (field in data) delete data[field];
    }
  },
});
