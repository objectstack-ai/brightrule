import { defineHook, type HookContext } from '@objectstack/spec/data';

/**
 * 制度意见 intake (brightrule#57), on every insert and update of
 * `brightrule_policy_suggestion`:
 *
 * 1. **大类 follows 类别**, always: 1–8 are 制度缺陷, 制度空白 and 有制度没找到
 *    are 匹配不上, 制度信息有误 is 制度信息. Nobody writes 大类 directly; a
 *    payload that clears 类别 clears it.
 * 2. **On insert**, 来源 defaults to 员工提交, and 处理状态 to 待处理 when the
 *    opinion already has a 类别 (an AI diagnosis does) or 待分诊 when not.
 *
 * Who may write 类别, 处理状态 and the other triage fields is not this hook's
 * job: the hook's session carries no permission sets, so the two permission
 * sets say it with field permissions (src/security/suggestion-fields.ts).
 *
 * The handler names nothing outside itself (the mapping is written inline),
 * so `os build` lowers it to a metadata-only body.
 */
export const PolicySuggestionIntakeHook = defineHook({
  name: 'brightrule_policy_suggestion_intake',
  object: 'brightrule_policy_suggestion',
  events: ['beforeInsert', 'beforeUpdate'],
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. An opinion has no field named `data`.
    const input = ctx.input as Record<string, unknown> | undefined;
    const nested = input?.data;
    const data = (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : input) as
      | Record<string, unknown>
      | undefined;
    if (!data) return;

    delete data.category_group;
    if ('category' in data) {
      const category = data.category;
      if (typeof category !== 'string' || category === '') {
        data.category_group = null;
      } else if (category === 'policy_gap' || category === 'not_found') {
        data.category_group = 'unmatched';
      } else if (category === 'metadata_error') {
        data.category_group = 'metadata';
      } else {
        data.category_group = 'defect';
      }
    }

    if (ctx.previous) return;
    if (typeof data.source !== 'string' || data.source === '') data.source = 'employee';
    if (typeof data.status !== 'string' || data.status === '') {
      data.status = typeof data.category === 'string' && data.category !== '' ? 'open' : 'triage';
    }
  },
});
