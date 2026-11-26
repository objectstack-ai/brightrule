import { defineHook, type HookContext } from '@objectstack/spec/data';

export const POLICY_PARENT_SELF = 'POLICY_PARENT_SELF';

/**
 * A policy cannot be its own 上级制度 (brightrule#48).
 *
 * Refuses a save whose `parent_policy` names the policy being saved: on
 * update the record's id, on insert an id the payload itself carries. A save
 * that does not touch `parent_policy` is not checked. Longer cycles (A → B →
 * A) are not looked for.
 *
 * The handler names nothing outside itself (its helpers and refusal codes are
 * written inline), so `os build` lowers it to a metadata-only body.
 */
export const PolicyParentHook = defineHook({
  name: 'brightrule_policy_parent',
  object: 'brightrule_policy',
  events: ['beforeInsert', 'beforeUpdate'],
  refusals: {
    [POLICY_PARENT_SELF]: {
      message: '上级制度不能选本制度自己，请改选另一份制度，或不填。',
      status: 400,
    },
  },
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. A policy has no field named `data`.
    const input = ctx.input as Record<string, unknown> | undefined;
    const nested = input?.data;
    const data = (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : input) as
      | Record<string, unknown>
      | undefined;
    if (!data || !('parent_policy' in data)) return;
    const previous = ctx.previous as Record<string, unknown> | undefined;
    // A reference field's id, whether the payload holds the id or the record.
    const refId = (value: unknown): string | undefined => {
      const v = value && typeof value === 'object' ? (value as { id?: unknown }).id : value;
      return typeof v === 'string' && v !== '' ? v : undefined;
    };
    const parentId = refId(data.parent_policy);
    if (!parentId) return;
    const ownId = refId(previous?.id) ?? refId(input?.id) ?? refId(data.id);
    if (ownId === parentId) {
      throw Object.assign(new Error('POLICY_PARENT_SELF'), { code: 'POLICY_PARENT_SELF' });
    }
  },
});
