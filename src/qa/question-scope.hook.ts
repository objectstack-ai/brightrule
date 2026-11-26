import { defineHook, type HookContext } from '@objectstack/spec/data';

export const QUESTION_SCOPE_POLICY_NOT_FOUND = 'QUESTION_SCOPE_POLICY_NOT_FOUND';
export const QUESTION_SCOPE_POLICY_NOT_PUBLISHED = 'QUESTION_SCOPE_POLICY_NOT_PUBLISHED';

/**
 * Runs before the answer hook (priority 100, the platform default) so a
 * question refused for its scope never reaches the model. The answer guard
 * (`question-guard.hook.ts`, priority 50) runs before this one; neither reads
 * what the other writes, so their order between themselves is not load-bearing.
 */
export const QUESTION_SCOPE_PRIORITY = 60;

/**
 * Keep an inquiry's scope (问询范围) consistent (brightrule#27, #45).
 *
 * - A question may only name a PUBLISHED policy: naming a draft, one being
 *   revised or an abolished one is refused, and so is a policy that does not
 *   exist or that the asker cannot read (the read goes through `ctx.api`, as
 *   the asker). The check runs when the save names the policy — a stored
 *   question whose policy has since been abolished is not refused for that on
 *   a later edit.
 * - `scope_kind` is derived, never taken from the payload: `policy` when a
 *   policy is named, else `general`. There are no versions (brightrule#45).
 *
 * An update that touches neither `scope_policy` nor `scope_kind` is not
 * checked again.
 *
 * The handler names nothing outside itself (its helpers and refusal codes are
 * written inline), so `os build` lowers it to a metadata-only body.
 */
export const QuestionScopeHook = defineHook({
  name: 'brightrule_question_scope',
  object: 'brightrule_question',
  events: ['beforeInsert', 'beforeUpdate'],
  priority: QUESTION_SCOPE_PRIORITY,
  refusals: {
    [QUESTION_SCOPE_POLICY_NOT_FOUND]: {
      message: '找不到所选的制度，或你无权读取它。',
      status: 400,
    },
    [QUESTION_SCOPE_POLICY_NOT_PUBLISHED]: {
      message: '只能就已发布的制度提问。所选制度尚未发布或已废止，请改选已发布的制度，或不指定制度。',
      status: 400,
    },
  },
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. A question has no field named `data`.
    const input = ctx.input as Record<string, unknown> | undefined;
    const nested = input?.data;
    const data = (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : input) as
      | Record<string, unknown>
      | undefined;
    if (!data) return;
    const previous = ctx.previous as Record<string, unknown> | undefined;
    // A reference field's id, whether the payload holds the id or the record.
    const refId = (value: unknown): string | undefined => {
      const v = value && typeof value === 'object' ? (value as { id?: unknown }).id : value;
      return typeof v === 'string' && v !== '' ? v : undefined;
    };
    const policyChanged = 'scope_policy' in data;
    // An update that touches no scope field (the answer, the status, …) has nothing to check.
    if (previous && !policyChanged && !('scope_kind' in data)) return;

    const policyId = refId(policyChanged ? data.scope_policy : previous?.scope_policy);
    if (policyId !== undefined && policyChanged && ctx.api) {
      const policy = (await ctx.api.object('brightrule_policy').findOne({
        where: { id: policyId },
      })) as Record<string, unknown> | null;
      if (!policy) {
        throw Object.assign(new Error('QUESTION_SCOPE_POLICY_NOT_FOUND'), { code: 'QUESTION_SCOPE_POLICY_NOT_FOUND' });
      }
      if (policy.status !== 'published') {
        throw Object.assign(new Error('QUESTION_SCOPE_POLICY_NOT_PUBLISHED'), {
          code: 'QUESTION_SCOPE_POLICY_NOT_PUBLISHED',
        });
      }
    }
    data.scope_kind = policyId === undefined ? 'general' : 'policy';
  },
});
