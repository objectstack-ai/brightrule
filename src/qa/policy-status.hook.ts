import { defineHook, type HookContext } from '@objectstack/spec/data';

type Row = Record<string, unknown>;

/**
 * Keep the clause index on published policies — the maintenance half of
 * policy inquiry while the clause table lives (brightrule#19, #45).
 *
 * A policy has no versions: its status is what decides whether its text is in
 * force. A clause is current (`is_current`) exactly when its policy is
 * published; a draft, a policy being revised and an abolished policy have no
 * current clauses. When a policy is written, every clause of it whose flag
 * disagrees with the policy's status is corrected.
 *
 * Writes go row by row through `ctx.api`, never as one predicate update: each
 * row write raises the record event the knowledge index follows, where a bulk
 * write raises only a count.
 *
 * The handler names nothing outside itself, so `os build` lowers it to a
 * metadata-only body.
 */
export const PolicyStatusHook = defineHook({
  name: 'brightrule_policy_status',
  object: 'brightrule_policy',
  events: ['afterInsert', 'afterUpdate'],
  handler: async (ctx: HookContext) => {
    const api = ctx.api;
    if (!api) return;
    const input = (ctx.input ?? {}) as { id?: unknown; data?: Row };
    const id = String(input.id ?? input.data?.id ?? (ctx.result as Row | undefined)?.id ?? '');
    if (!id) return;
    const policy = (await api.object('brightrule_policy').findOne({
      where: { id },
      fields: ['id', 'status'],
    })) as Row | null;
    if (!policy) return;
    const isCurrent = policy.status === 'published';

    const clauses = (await api.object('brightrule_clause').find({
      where: { policy: id },
      fields: ['id', 'is_current'],
    })) as Row[];
    for (const clause of clauses ?? []) {
      if (Boolean(clause.is_current) !== isCurrent) {
        await api.object('brightrule_clause').update({ id: clause.id, is_current: isCurrent });
      }
    }
  },
});

export const CLAUSE_POLICY_NOT_FOUND = 'CLAUSE_POLICY_NOT_FOUND';

/**
 * A clause is current exactly when its policy is published, from the save
 * that files it.
 *
 * - On insert, `is_current` is set from the policy's status, whatever the
 *   payload says, so a maintainer splitting a published policy into clauses
 *   never ticks the flag by hand.
 * - Moving a clause to another policy re-derives it from that policy.
 * - An update that does not touch `policy` (the text, or `is_current` written
 *   by {@link PolicyStatusHook}) is left alone.
 * - A policy that does not exist, or that the writer cannot read, is refused.
 *
 * The handler names nothing outside itself (its helpers and refusal codes are
 * written inline), so `os build` lowers it to a metadata-only body.
 */
export const ClauseCurrentHook = defineHook({
  name: 'brightrule_clause_current',
  object: 'brightrule_clause',
  events: ['beforeInsert', 'beforeUpdate'],
  refusals: {
    [CLAUSE_POLICY_NOT_FOUND]: {
      message: '找不到所选的制度，或你无权读取它。',
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
    const policyChanged = 'policy' in data;
    // An update that does not move the clause (is_current, text, …) has nothing to derive.
    if (previous && !policyChanged) return;

    const policyId = refId(policyChanged ? data.policy : previous?.policy);
    if (!policyId) return; // the field's own required check answers a missing policy
    const policy = (await ctx.api.object('brightrule_policy').findOne({
      where: { id: policyId },
    })) as Record<string, unknown> | null;
    if (!policy) throw Object.assign(new Error('CLAUSE_POLICY_NOT_FOUND'), { code: 'CLAUSE_POLICY_NOT_FOUND' });
    data.is_current = policy.status === 'published';
  },
});
