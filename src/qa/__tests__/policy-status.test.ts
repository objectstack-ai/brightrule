import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import { PolicyStatusHook } from '../policy-status.hook.js';

type Row = Record<string, unknown>;

/** An in-memory store the policy hook reads and writes through `ctx.api`. */
function fakeApi(tables: Record<string, Row[]>) {
  const updates: { object: string; row: Row }[] = [];
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: Row }) => (tables[name] ?? []).find((r) => matches(r, where)) ?? null,
      find: async ({ where }: { where: Row }) => (tables[name] ?? []).filter((r) => matches(r, where)),
      update: async (row: Row) => {
        updates.push({ object: name, row });
        const stored = (tables[name] ?? []).find((r) => r.id === row.id);
        if (stored) Object.assign(stored, row);
      },
    }),
  };
  return { api, updates };
}

async function runPolicyHook(tables: Record<string, Row[]>, input: Row, result?: Row) {
  const { api, updates } = fakeApi(tables);
  const ctx = { input, result, api } as unknown as HookContext;
  const handler = PolicyStatusHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return updates;
}

function store(status: string, clausesCurrent: boolean): Record<string, Row[]> {
  return {
    brightrule_policy: [{ id: 'pA', status }],
    brightrule_clause: [
      { id: 'c1', policy: 'pA', is_current: clausesCurrent },
      { id: 'c2', policy: 'pA', is_current: clausesCurrent },
      { id: 'cX', policy: 'pOther', is_current: clausesCurrent },
    ],
  };
}

describe("a policy's status carries to its clauses", () => {
  it('runs after a policy is written', () => {
    expect(PolicyStatusHook.object).toBe('brightrule_policy');
    expect(PolicyStatusHook.events).toEqual(['afterInsert', 'afterUpdate']);
  });

  it("makes the clauses of a published policy current, row by row, and no other policy's", async () => {
    const tables = store('published', false);
    const updates = await runPolicyHook(tables, { id: 'pA' });
    expect(updates).toEqual([
      { object: 'brightrule_clause', row: { id: 'c1', is_current: true } },
      { object: 'brightrule_clause', row: { id: 'c2', is_current: true } },
    ]);
    expect(tables.brightrule_clause.find((c) => c.id === 'cX')?.is_current).toBe(false);
  });

  it.each(['draft', 'revising', 'abolished'])('retires the clauses of a %s policy', async (status) => {
    const tables = store(status, true);
    await runPolicyHook(tables, { id: 'pA' });
    expect(tables.brightrule_clause.filter((c) => c.policy === 'pA').map((c) => c.is_current)).toEqual([false, false]);
  });

  it('writes nothing when the clauses already agree', async () => {
    expect(await runPolicyHook(store('published', true), { id: 'pA' })).toEqual([]);
  });

  it('finds the policy id in the payload or in the result', async () => {
    let tables = store('published', false);
    await runPolicyHook(tables, { data: { id: 'pA' } });
    expect(tables.brightrule_clause[0].is_current).toBe(true);
    tables = store('published', false);
    await runPolicyHook(tables, {}, { id: 'pA' });
    expect(tables.brightrule_clause[0].is_current).toBe(true);
  });
});
