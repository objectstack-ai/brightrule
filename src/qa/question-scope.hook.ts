import { defineHook, type HookContext } from '@objectstack/spec/data';

export const QUESTION_SCOPE_POLICY_MISMATCH = 'QUESTION_SCOPE_POLICY_MISMATCH';
export const QUESTION_SCOPE_VERSION_NOT_FOUND = 'QUESTION_SCOPE_VERSION_NOT_FOUND';
export const QUESTION_SCOPE_VERSION_NOT_CURRENT = 'QUESTION_SCOPE_VERSION_NOT_CURRENT';

/**
 * Runs before the answer hook (priority 100, the platform default) so a
 * question refused for its scope never reaches the model. The answer guard
 * (`question-guard.hook.ts`, priority 50) runs before this one; neither reads
 * what the other writes, so their order between themselves is not load-bearing.
 */
export const QUESTION_SCOPE_PRIORITY = 60;

/**
 * Keep an inquiry's scope (问询范围) consistent (brightrule#27).
 *
 * - The version decides the policy: a save that names a version and no
 *   `scope_policy` gets the version's policy; one that names a different
 *   policy is refused, and so is a version that does not exist or that the
 *   asker cannot read (the read goes through `ctx.api`, as the asker).
 * - A question may only name a CURRENT version: naming a draft or superseded
 *   one is refused (brightrule#9, open item). The check runs when the save
 *   names the version — a stored question whose version has since been
 *   superseded is not refused for that on a later edit.
 * - `scope_kind` is derived, never taken from the payload: `version` when a
 *   version is named, else `policy` when a policy is, else `general`.
 *
 * An update that touches none of `scope_policy`, `scope_version`,
 * `scope_kind` is not checked again.
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
    [QUESTION_SCOPE_POLICY_MISMATCH]: {
      message: '问询的「指定制度」必须是「指定版本」所属的制度。只选版本即可，指定制度会自动带出。',
      status: 400,
    },
    [QUESTION_SCOPE_VERSION_NOT_FOUND]: {
      message: '找不到所选的制度版本，或你无权读取它。',
      status: 400,
    },
    [QUESTION_SCOPE_VERSION_NOT_CURRENT]: {
      message: '只能就现行版本提问。所选版本不是现行版本，请改选现行版本，或只选制度。',
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
    const versionChanged = 'scope_version' in data;
    const policyChanged = 'scope_policy' in data;
    // An update that touches no scope field (the answer, the status, …) has nothing to check.
    if (previous && !versionChanged && !policyChanged && !('scope_kind' in data)) return;

    const versionId = refId(versionChanged ? data.scope_version : previous?.scope_version);
    if (versionId === undefined) {
      const policyId = refId(policyChanged ? data.scope_policy : previous?.scope_policy);
      data.scope_kind = policyId === undefined ? 'general' : 'policy';
      return;
    }

    if ((versionChanged || policyChanged) && ctx.api) {
      const version = (await ctx.api.object('brightrule_policy_version').findOne({
        where: { id: versionId },
      })) as Record<string, unknown> | null;
      if (!version) {
        throw Object.assign(new Error('QUESTION_SCOPE_VERSION_NOT_FOUND'), { code: 'QUESTION_SCOPE_VERSION_NOT_FOUND' });
      }
      if (versionChanged && version.version_status !== 'current') {
        throw Object.assign(new Error('QUESTION_SCOPE_VERSION_NOT_CURRENT'), {
          code: 'QUESTION_SCOPE_VERSION_NOT_CURRENT',
        });
      }
      const versionPolicy = refId(version.policy);
      // The policy this save asks for: the payload's, else (version unchanged) the stored one.
      const askedPolicy = refId(
        policyChanged ? data.scope_policy : versionChanged ? undefined : previous?.scope_policy,
      );
      if (askedPolicy === undefined) data.scope_policy = versionPolicy;
      else if (askedPolicy !== versionPolicy) {
        throw Object.assign(new Error('QUESTION_SCOPE_POLICY_MISMATCH'), { code: 'QUESTION_SCOPE_POLICY_MISMATCH' });
      }
    }
    data.scope_kind = 'version';
  },
});
