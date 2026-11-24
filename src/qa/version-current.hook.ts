import { defineHook, type HookContext } from '@objectstack/spec/data';

type Row = Record<string, unknown>;

/**
 * Keep the inquiry index on the current text — the maintenance half of policy
 * inquiry. Marking a version `current` is the one act a maintainer performs;
 * this hook carries its consequences:
 *
 *   1. every clause of the version becomes current (`is_current`), and every
 *      clause of a version that is not current stops being so;
 *   2. the policy's other current version is superseded (which runs this hook
 *      for it in turn, retiring its clauses);
 *   3. the policy records the new version as its `current_version`.
 *
 * Writes go row by row through `ctx.api`, never as one predicate update: each
 * row write raises the record event the knowledge index follows, where a bulk
 * write raises only a count.
 */
export const VersionCurrentHook = defineHook({
  name: 'brightrule_policy_version_current',
  object: 'brightrule_policy_version',
  events: ['afterInsert', 'afterUpdate'],
  handler: async (ctx: HookContext) => {
    const api = ctx.api;
    if (!api) return;
    const input = ctx.input as { id?: unknown; data?: Row };
    const id = String(input.id ?? input.data?.id ?? (ctx.result as Row | undefined)?.id ?? '');
    if (!id) return;
    const version = (await api.object('brightrule_policy_version').findOne({ where: { id } })) as Row | null;
    if (!version) return;
    const isCurrent = version.version_status === 'current';

    const clauses = (await api.object('brightrule_clause').find({
      where: { policy_version: id },
      fields: ['id', 'is_current'],
    })) as Row[];
    for (const clause of clauses) {
      if (Boolean(clause.is_current) !== isCurrent) {
        await api.object('brightrule_clause').update({ id: clause.id, is_current: isCurrent });
      }
    }

    if (!isCurrent || !version.policy) return;
    const siblings = (await api.object('brightrule_policy_version').find({
      where: { policy: version.policy, version_status: 'current' },
      fields: ['id'],
    })) as Row[];
    for (const sibling of siblings) {
      if (sibling.id !== id) {
        await api.object('brightrule_policy_version').update({ id: sibling.id, version_status: 'superseded' });
      }
    }
    await api.object('brightrule_policy').update({
      id: version.policy,
      current_version: version.version_no ?? null,
      ...(version.effective_date ? { effective_date: version.effective_date } : {}),
    });
  },
});

export const CLAUSE_POLICY_MISMATCH = 'CLAUSE_POLICY_MISMATCH';
export const CLAUSE_VERSION_NOT_FOUND = 'CLAUSE_VERSION_NOT_FOUND';

/**
 * Keep a clause's two parents in step, and its currency with its version.
 *
 * A clause names its policy (`policy`, the master its permissions follow) and
 * its version (`policy_version`, the text it belongs to). The version already
 * belongs to one policy, so the two must agree: a clause filed under policy A
 * with policy B's version would be read under A's permissions while its text,
 * and its currency, follow B.
 *
 * - The version decides: a save that names a version and no policy gets the
 *   version's policy; one that names a different policy is refused.
 * - Moving a clause to another version moves it to that version's policy.
 * - A clause added to, or moved to, the current version is current from that
 *   save, so a maintainer splitting a published policy into clauses never has
 *   to tick the flag by hand.
 *
 * The handler names nothing outside itself (its helpers and refusal codes are
 * written inline), so `os build` lowers it to a metadata-only body.
 */
export const ClauseCurrentHook = defineHook({
  name: 'brightrule_clause_current',
  object: 'brightrule_clause',
  events: ['beforeInsert', 'beforeUpdate'],
  refusals: {
    [CLAUSE_POLICY_MISMATCH]: {
      message: '条款的「所属制度」必须是「所属版本」所属的制度。只选版本即可，所属制度会自动带出。',
      status: 400,
    },
    [CLAUSE_VERSION_NOT_FOUND]: {
      message: '找不到所选的制度版本，或你无权读取它。',
      status: 400,
    },
  },
  handler: async (ctx: HookContext) => {
    // The write payload: `ctx.input` itself in a lowered body, `ctx.input.data`
    // for a bundled handler. A clause has no field named `data`.
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
    const versionChanged = 'policy_version' in data;
    const policyChanged = 'policy' in data;
    // An update that touches neither parent (is_current, text, …) has nothing to check.
    if (previous && !versionChanged && !policyChanged) return;

    const versionId = refId(versionChanged ? data.policy_version : previous?.policy_version);
    if (!versionId) return; // the field's own required check answers a missing version
    const version = (await ctx.api.object('brightrule_policy_version').findOne({
      where: { id: versionId },
    })) as Record<string, unknown> | null;
    if (!version) throw Object.assign(new Error('CLAUSE_VERSION_NOT_FOUND'), { code: 'CLAUSE_VERSION_NOT_FOUND' });
    const versionPolicy = refId(version.policy);

    // The policy this save asks for: the payload's, else (version unchanged) the stored one.
    const askedPolicy = refId(policyChanged ? data.policy : versionChanged ? undefined : previous?.policy);
    if (askedPolicy === undefined) data.policy = versionPolicy;
    else if (askedPolicy !== versionPolicy) {
      throw Object.assign(new Error('CLAUSE_POLICY_MISMATCH'), { code: 'CLAUSE_POLICY_MISMATCH' });
    }

    if (!previous || versionChanged) data.is_current = version.version_status === 'current';
  },
});
