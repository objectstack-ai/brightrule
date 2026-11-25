import { defineHook, type HookContext } from '@objectstack/spec/data';

export const RELATION_POLICY_MISMATCH = 'RELATION_POLICY_MISMATCH';
export const RELATION_VERSION_NOT_FOUND = 'RELATION_VERSION_NOT_FOUND';
export const RELATION_SELF_REFERENCE = 'RELATION_SELF_REFERENCE';
export const RELATION_DUPLICATE = 'RELATION_DUPLICATE';

/**
 * Keep a policy relation (制度关系) consistent with its version (brightrule#23).
 *
 * - The version decides the policy: a save that names a version and no
 *   `from_policy` gets the version's policy; one that names a different policy
 *   is refused, and so is a version that does not exist or cannot be read.
 * - A relation never points at its own policy: old and new versions of one
 *   policy are told apart by version status, not by a 「替代」 relation.
 * - Within one version, one relation type points at one target once. The
 *   target is `to_policy` when set; for a policy outside the library it is
 *   `to_title`, compared after removing 《》 and surrounding whitespace, so
 *   「《费用报销管理规定》」 and 「费用报销管理规定 」 are the same target.
 * - A relation that names `to_policy` and no `to_title` gets the target's
 *   title, written as 《title》 — the way an extracted name reads in the text.
 *
 * An update that touches none of the version, the two policies, the title or
 * the type (confirming it, editing the articles) is not checked again. The
 * duplicate check on an update leaves the record itself out.
 *
 * The handler names nothing outside itself (its helpers and refusal codes are
 * written inline), so `os build` lowers it to a metadata-only body.
 */
export const PolicyRelationHook = defineHook({
  name: 'brightrule_policy_relation_check',
  object: 'brightrule_policy_relation',
  events: ['beforeInsert', 'beforeUpdate'],
  refusals: {
    [RELATION_POLICY_MISMATCH]: {
      message: '制度关系的「出自制度」必须是「出自版本」所属的制度。只选版本即可，出自制度会自动带出。',
      status: 400,
    },
    [RELATION_VERSION_NOT_FOUND]: {
      message: '找不到所选的制度版本，或你无权读取它。',
      status: 400,
    },
    [RELATION_SELF_REFERENCE]: {
      message: '对方制度不能是本制度。同一制度的新旧版本由版本状态区分，不用「替代」关系表达。',
      status: 400,
    },
    [RELATION_DUPLICATE]: {
      message: '本版本已有同一类型、指向同一对方制度的关系，不能重复添加。',
      status: 400,
    },
  },
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. A relation has no field named `data`.
    const input = ctx.input as Record<string, unknown> | undefined;
    const nested = input?.data;
    const data = (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : input) as
      | Record<string, unknown>
      | undefined;
    if (!data || !ctx.api) return;
    const previous = ctx.previous as Record<string, unknown> | undefined;
    // A reference field's id, whether the payload holds the id or the record.
    const refId = (value: unknown): string | undefined => {
      const v = value && typeof value === 'object' ? (value as { id?: unknown }).id : value;
      return typeof v === 'string' && v !== '' ? v : undefined;
    };
    // The value this save leaves on the record: the payload's, else the stored one.
    const after = (field: string): unknown => (field in data ? data[field] : previous?.[field]);
    // An external target's name, compared without 《》 and surrounding whitespace.
    const normalize = (title: unknown): string =>
      typeof title === 'string' ? title.replace(/[《》]/g, '').trim() : '';

    const watched = ['from_version', 'from_policy', 'to_policy', 'to_title', 'relation_type'];
    // An update that touches none of them (confirmed, from_articles, source) has nothing to check.
    if (previous && !watched.some((field) => field in data)) return;

    const versionChanged = 'from_version' in data;
    const versionId = refId(after('from_version'));
    if (!versionId) return; // the field's own required check answers a missing version
    const version = (await ctx.api.object('brightrule_policy_version').findOne({
      where: { id: versionId },
    })) as Record<string, unknown> | null;
    if (!version) throw Object.assign(new Error('RELATION_VERSION_NOT_FOUND'), { code: 'RELATION_VERSION_NOT_FOUND' });
    const versionPolicy = refId(version.policy);

    // The policy this save asks for: the payload's, else (version unchanged) the stored one.
    const askedPolicy = refId(
      'from_policy' in data ? data.from_policy : versionChanged ? undefined : previous?.from_policy,
    );
    if (askedPolicy === undefined) data.from_policy = versionPolicy;
    else if (askedPolicy !== versionPolicy) {
      throw Object.assign(new Error('RELATION_POLICY_MISMATCH'), { code: 'RELATION_POLICY_MISMATCH' });
    }

    const toPolicy = refId(after('to_policy'));
    if (toPolicy !== undefined && toPolicy === versionPolicy) {
      throw Object.assign(new Error('RELATION_SELF_REFERENCE'), { code: 'RELATION_SELF_REFERENCE' });
    }

    let toTitle = after('to_title');
    if (toPolicy !== undefined && normalize(toTitle) === '') {
      const target = (await ctx.api.object('brightrule_policy').findOne({
        where: { id: toPolicy },
      })) as Record<string, unknown> | null;
      const name = normalize(target?.title);
      if (name !== '') {
        toTitle = `《${name}》`;
        data.to_title = toTitle;
      }
    }

    const relationType = after('relation_type');
    if (typeof relationType !== 'string' || relationType === '') return; // the required check answers
    const targetKey = (policyId: string | undefined, title: unknown): string =>
      policyId !== undefined ? `policy:${policyId}` : `title:${normalize(title)}`;
    const key = targetKey(toPolicy, toTitle);
    if (key === 'title:') return; // no target named: the required check on to_title answers

    const selfId = refId(previous?.id);
    const siblings = (await ctx.api.object('brightrule_policy_relation').find({
      where: { from_version: versionId, relation_type: relationType },
      fields: ['id', 'to_policy', 'to_title'],
    })) as Record<string, unknown>[];
    const duplicate = (siblings ?? []).some(
      (row) => refId(row.id) !== selfId && targetKey(refId(row.to_policy), row.to_title) === key,
    );
    if (duplicate) throw Object.assign(new Error('RELATION_DUPLICATE'), { code: 'RELATION_DUPLICATE' });
  },
});
