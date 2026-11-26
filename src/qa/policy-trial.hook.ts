import { defineHook, type HookContext } from '@objectstack/spec/data';

/**
 * 试行 follows the title (brightrule#52).
 *
 * A policy is a trial one (`is_trial`) when its title says so: it contains
 * 「试行」 or 「暂行」, as in 「……管理办法（试行）」 or 「……暂行规定」.
 *
 * - On insert the flag is set from the title, whatever the payload says.
 * - An update that changes the title re-derives it: taking 「试行」 out of the
 *   title turns the flag off.
 * - An update that leaves the title as it was — not in the payload, or the
 *   same text a form sends back — does not touch the flag, so a maintainer's
 *   correction stands until the title next changes.
 *
 * The handler names nothing outside itself (its pattern is written inline),
 * so `os build` lowers it to a metadata-only body.
 */
export const PolicyTrialHook = defineHook({
  name: 'brightrule_policy_trial',
  object: 'brightrule_policy',
  events: ['beforeInsert', 'beforeUpdate'],
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. A policy has no field named `data`.
    const input = ctx.input as Record<string, unknown> | undefined;
    const nested = input?.data;
    const data = (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : input) as
      | Record<string, unknown>
      | undefined;
    if (!data || !('title' in data)) return;
    const title = data.title;
    if (typeof title !== 'string') return; // the field's own required check answers a missing title
    const previous = ctx.previous as Record<string, unknown> | undefined;
    if (previous && previous.title === title) return;
    data.is_trial = /试行|暂行/.test(title);
  },
});
