import { defineHook, type HookContext } from '@objectstack/spec/data';

/**
 * 制度大类 follows 制度分类 (brightrule#54).
 *
 * The group's policy system sorts its 12 小类 into three major classes
 * (规章制度体系管理规范, 第四条): 公司治理类 is 治理类, 党工纪类 is 党工纪类, and
 * every other 小类 is 经营管理类.
 *
 * - On insert the class is set from the category, whatever the payload says.
 * - An update that changes the category re-derives it.
 * - An update that leaves the category as it was — not in the payload, or the
 *   same value a form sends back — does not touch the class, so a maintainer's
 *   correction stands until the category next changes.
 * - An empty category leaves the class alone: there is nothing to derive from.
 *
 * The handler names nothing outside itself (its mapping is written inline), so
 * `os build` lowers it to a metadata-only body.
 */
export const PolicyCategoryGroupHook = defineHook({
  name: 'brightrule_policy_category_group',
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
    if (!data || !('category' in data)) return;
    const category = data.category;
    if (typeof category !== 'string' || category === '') return;
    const previous = ctx.previous as Record<string, unknown> | undefined;
    if (previous && previous.category === category) return;
    data.category_group = category === 'governance' ? 'governance' : category === 'party' ? 'party' : 'operations';
  },
});
