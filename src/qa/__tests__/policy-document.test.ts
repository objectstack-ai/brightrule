import { describe, it, expect } from 'vitest';
import type { HookContext } from '@objectstack/spec/data';
import {
  DOCUMENT_POLICY_MISMATCH,
  DOCUMENT_VERSION_NOT_FOUND,
  PolicyDocumentHook,
  VersionCurrentHook,
} from '../version-current.hook.js';

type Row = Record<string, unknown>;

const VERSIONS: Row[] = [
  { id: 'vA3', policy: 'pA', version_status: 'current' },
  { id: 'vA2', policy: 'pA', version_status: 'superseded' },
  { id: 'vB1', policy: 'pB', version_status: 'current' },
];

/** Run the document hook on a payload (and, for an update, the stored row); return the payload it leaves. */
async function save(data: Row, previous?: Row, flat = false): Promise<Row> {
  const api = {
    object: (name: string) => ({
      findOne: async ({ where }: { where: { id: string } }) =>
        name === 'brightrule_policy_version' ? (VERSIONS.find((v) => v.id === where.id) ?? null) : null,
    }),
  };
  const ctx = { input: flat ? data : { data }, previous, api } as unknown as HookContext;
  const handler = PolicyDocumentHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return data;
}

async function refusal(data: Row, previous?: Row): Promise<string | undefined> {
  try {
    await save(data, previous);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe('a version document keeps its policy and version in step', () => {
  it('declares a refusal for each rule it enforces', () => {
    expect(Object.keys(PolicyDocumentHook.refusals ?? {})).toEqual([DOCUMENT_POLICY_MISMATCH, DOCUMENT_VERSION_NOT_FOUND]);
  });

  it('fills the policy from the version when only the version is given', async () => {
    const d = await save({ title: 't', doc_kind: 'body', policy_version: 'vA3' });
    expect(d.policy).toBe('pA');
    expect(d.is_current).toBe(true);
  });

  it('accepts the matching policy, as an id or as a record', async () => {
    expect((await save({ policy: 'pA', policy_version: 'vA2' })).is_current).toBe(false);
    expect((await save({ policy: { id: 'pB' }, policy_version: { id: 'vB1' } })).policy).toEqual({ id: 'pB' });
  });

  it("refuses a policy that is not the version's", async () => {
    expect(await refusal({ policy: 'pB', policy_version: 'vA3' })).toBe(DOCUMENT_POLICY_MISMATCH);
  });

  it('refuses moving the policy alone away from the version', async () => {
    expect(await refusal({ policy: 'pB' }, { policy: 'pA', policy_version: 'vA3' })).toBe(DOCUMENT_POLICY_MISMATCH);
  });

  it('refuses a version that does not exist or cannot be read', async () => {
    expect(await refusal({ policy: 'pA', policy_version: 'nope' })).toBe(DOCUMENT_VERSION_NOT_FOUND);
  });

  it('is current exactly when its version is, on insert', async () => {
    expect((await save({ policy_version: 'vA3', is_current: false })).is_current).toBe(true);
    expect((await save({ policy_version: 'vA2', is_current: true })).is_current).toBe(false);
  });

  it('moves with its version, and its currency with it', async () => {
    const up = await save({ policy_version: 'vB1' }, { policy: 'pA', policy_version: 'vA2', is_current: false });
    expect(up.policy).toBe('pB');
    expect(up.is_current).toBe(true);
    const down = await save({ policy_version: 'vA2' }, { policy: 'pA', policy_version: 'vA3', is_current: true });
    expect(down.policy).toBe('pA');
    expect(down.is_current).toBe(false);
  });

  it('reads the payload as a lowered body receives it (ctx.input is the payload)', async () => {
    const d = await save({ title: 't', policy_version: 'vB1' }, undefined, true);
    expect(d.policy).toBe('pB');
    expect(d.is_current).toBe(true);
  });

  it('leaves an update that touches neither parent alone', async () => {
    const d = await save({ body_md_redacted: '# 新正文', is_current: false }, { policy: 'pA', policy_version: 'vA3' });
    expect(d).toEqual({ body_md_redacted: '# 新正文', is_current: false });
  });
});

/** An in-memory store the version hook reads and writes through `ctx.api`. */
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

async function runVersionHook(tables: Record<string, Row[]>, versionId: string) {
  const { api, updates } = fakeApi(tables);
  const ctx = { input: { id: versionId }, api } as unknown as HookContext;
  const handler = VersionCurrentHook.handler as unknown as (c: HookContext) => Promise<void>;
  await handler(ctx);
  return updates;
}

function store(policyStatus: string, versionStatus: string): Record<string, Row[]> {
  return {
    brightrule_policy: [{ id: 'pA', status: policyStatus }],
    brightrule_policy_version: [{ id: 'vA1', policy: 'pA', version_no: 'V1.0', version_status: versionStatus }],
    brightrule_clause: [{ id: 'c1', policy_version: 'vA1', is_current: versionStatus !== 'current' }],
    brightrule_policy_document: [
      { id: 'd0', policy_version: 'vA1', is_current: versionStatus !== 'current' },
      { id: 'd1', policy_version: 'vA1', is_current: versionStatus !== 'current' },
      { id: 'dX', policy_version: 'vOther', is_current: versionStatus !== 'current' },
    ],
  };
}

describe("a version's status carries to its documents and its policy", () => {
  it("makes the documents of a version set current current, row by row, and no other version's", async () => {
    const tables = store('published', 'current');
    const updates = await runVersionHook(tables, 'vA1');
    const docUpdates = updates.filter((u) => u.object === 'brightrule_policy_document');
    expect(docUpdates.map((u) => u.row)).toEqual([
      { id: 'd0', is_current: true },
      { id: 'd1', is_current: true },
    ]);
    expect(tables.brightrule_policy_document.find((d) => d.id === 'dX')?.is_current).toBe(false);
    // clauses keep their behaviour
    expect(tables.brightrule_clause[0].is_current).toBe(true);
  });

  it('retires the documents of a version that stops being current', async () => {
    const tables = store('published', 'superseded');
    await runVersionHook(tables, 'vA1');
    expect(tables.brightrule_policy_document.filter((d) => d.policy_version === 'vA1').map((d) => d.is_current)).toEqual([
      false,
      false,
    ]);
    expect(tables.brightrule_clause[0].is_current).toBe(false);
  });

  it('publishes a draft policy when its version is set current', async () => {
    const tables = store('draft', 'current');
    await runVersionHook(tables, 'vA1');
    expect(tables.brightrule_policy[0]).toMatchObject({ status: 'published', current_version: 'V1.0' });
  });

  it.each(['published', 'revising', 'abolished'])('leaves a %s policy status alone', async (status) => {
    const tables = store(status, 'current');
    const updates = await runVersionHook(tables, 'vA1');
    const policyUpdate = updates.find((u) => u.object === 'brightrule_policy')?.row;
    expect(policyUpdate).toBeDefined();
    expect(policyUpdate).not.toHaveProperty('status');
    expect(tables.brightrule_policy[0].status).toBe(status);
  });

  it('does not publish a draft policy whose version is not current', async () => {
    const tables = store('draft', 'draft');
    const updates = await runVersionHook(tables, 'vA1');
    expect(updates.some((u) => u.object === 'brightrule_policy')).toBe(false);
    expect(tables.brightrule_policy[0].status).toBe('draft');
  });
});
