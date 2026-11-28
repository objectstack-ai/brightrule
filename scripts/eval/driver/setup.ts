/**
 * Load an evaluation corpus into an environment where BrightRule is
 * installed, as its administrator, through the same data API the app's own
 * forms use. Every step is an upsert keyed by a stable value, so running it
 * again changes only what differs:
 *
 * - units (`sys_business_unit`, by `code`), parents first;
 * - persona accounts (by email): created with a first password, which the
 *   account changes once (an admin-made account must) to the run password;
 * - each persona's primary unit (`sys_business_unit_member`, `is_primary`),
 *   which is what the platform reads for the 提问人 block (cloud#5099). A
 *   persona without a unit has its memberships removed;
 * - the 问询人 permission set (`brightrule_inquirer`) granted to each persona
 *   by name. The app marks it default (bound to everyone at boot), but an app
 *   installed into a running environment does not get that binding until the
 *   next boot, and a persona without it reads no policy at all;
 * - an AI seat for each persona (environments without seats skip it);
 * - policies (`brightrule_policy`, by `policy_no` = corpus key), then their
 *   上级制度 links, then attachments (by policy and `sort_no`).
 *
 * Use an environment kept for evaluation: policies already there that the
 * corpus does not name are left as they are and crowd the catalog.
 */
import { textStats } from '../../../src/data/document-text.js';
import type { Corpus, CorpusPolicy, Unit } from '../schema.js';
import { call, failure, idOf, listAll, pool, signIn, type Session } from './http.js';

export interface SetupOptions {
  baseUrl: string;
  admin: Session;
  /** The password every persona signs in with. */
  password: string;
  concurrency: number;
  /** The permission set granted to every persona (default `brightrule_inquirer`). */
  permissionSet?: string;
  /** Load units and accounts only. */
  skipPolicies?: boolean;
  log: (line: string) => void;
}

export interface SetupResult {
  units: number;
  personas: number;
  policies: { created: number; updated: number };
  attachments: number;
  warnings: string[];
}

/** The fields a corpus policy writes to `brightrule_policy`. 试行 and 大类 are left to the app's hooks, which derive them. */
export function policyRow(p: CorpusPolicy, unitId: string): Record<string, unknown> {
  const { text_chars, text_tokens } = textStats(p.body_md);
  const row: Record<string, unknown> = {
    title: p.title,
    policy_no: p.key,
    owning_unit: unitId,
    issuance_type: p.issuance_type,
    category: p.category,
    status: p.status,
    body_md: p.body_md,
    article_index: p.article_index,
    text_chars,
    text_tokens,
    has_images: false,
  };
  for (const k of ['doc_no', 'issuing_unit', 'policy_level', 'department', 'addressees', 'summary', 'issued_date', 'effective_date'] as const) {
    if (p[k] !== undefined) row[k] = p[k];
  }
  return row;
}

/** Units ordered so that every parent comes before its children. */
export function parentsFirst(units: readonly Unit[]): Unit[] {
  const byCode = new Map(units.map((u) => [u.code, u]));
  const out: Unit[] = [];
  const placed = new Set<string>();
  const place = (u: Unit, path: Set<string>) => {
    if (placed.has(u.code)) return;
    if (path.has(u.code)) throw new Error(`unit cycle at ${u.code}`);
    path.add(u.code);
    const parent = u.parent ? byCode.get(u.parent) : undefined;
    if (u.parent && !parent) throw new Error(`unit ${u.code}: parent ${u.parent} is not in the corpus`);
    if (parent) place(parent, path);
    placed.add(u.code);
    out.push(u);
  };
  for (const u of units) place(u, new Set());
  return out;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : undefined);

async function upsertUnits(s: Session, corpus: Corpus, o: SetupOptions): Promise<Map<string, string>> {
  const existing = await listAll(s, 'sys_business_unit', ['id', 'code', 'name', 'kind', 'parent_business_unit_id']);
  const idByCode = new Map<string, string>();
  const rowByCode = new Map<string, Record<string, unknown>>();
  for (const r of existing) if (typeof r.code === 'string') { idByCode.set(r.code, String(r.id)); rowByCode.set(r.code, r); }
  for (const u of parentsFirst(corpus.units)) {
    const want = { name: u.name, code: u.code, kind: u.kind, parent_business_unit_id: u.parent ? idByCode.get(u.parent) ?? null : null };
    const have = rowByCode.get(u.code);
    if (!have) {
      const a = await call(s, 'POST', '/api/v1/data/sys_business_unit', want);
      if (!a.ok) throw failure(`create unit ${u.code}`, a);
      const id = idOf(a.json);
      if (!id) throw new Error(`create unit ${u.code}: no id in the answer`);
      idByCode.set(u.code, id);
    } else if (have.name !== want.name || have.kind !== want.kind || (str(have.parent_business_unit_id) ?? null) !== want.parent_business_unit_id) {
      const a = await call(s, 'PATCH', `/api/v1/data/sys_business_unit/${idByCode.get(u.code)}`, want);
      if (!a.ok) throw failure(`update unit ${u.code}`, a);
    }
  }
  o.log(`units: ${corpus.units.length} in place`);
  return idByCode;
}

async function ensureAccount(s: Session, email: string, name: string, existingId: string | undefined, o: SetupOptions): Promise<string> {
  if (existingId) {
    try {
      await signIn(o.baseUrl, email, o.password);
      return existingId;
    } catch {
      // Reset to a first password and change it below, as for a new account.
      const first = `${o.password}-first`;
      const r = await call(s, 'POST', '/api/v1/auth/admin/set-user-password', { userId: existingId, newPassword: first });
      if (!r.ok) throw failure(`${email} exists and the run password does not sign in; reset`, r);
      await changePassword(o.baseUrl, email, first, o.password);
      return existingId;
    }
  }
  const first = `${o.password}-first`;
  const c = await call(s, 'POST', '/api/v1/auth/admin/create-user', { email, password: first, name, role: 'user' });
  if (!c.ok) throw failure(`create account ${email}`, c);
  const j = c.json as { data?: { user?: { id?: string } }; user?: { id?: string } };
  const id = j.data?.user?.id ?? j.user?.id;
  if (!id) throw new Error(`create account ${email}: no id in the answer`);
  await changePassword(o.baseUrl, email, first, o.password);
  return id;
}

async function changePassword(baseUrl: string, email: string, from: string, to: string) {
  const sess = await signIn(baseUrl, email, from);
  const a = await call(sess, 'POST', '/api/v1/auth/change-password', { currentPassword: from, newPassword: to, revokeOtherSessions: false });
  if (!a.ok) throw failure(`change password of ${email}`, a);
}

async function setupPersonas(s: Session, corpus: Corpus, unitIds: Map<string, string>, o: SetupOptions, warnings: string[]) {
  const users = await listAll(s, 'sys_user', ['id', 'email']);
  const userByEmail = new Map(users.map((u) => [String(u.email ?? '').toLowerCase(), String(u.id)]));
  const members = await listAll(s, 'sys_business_unit_member', ['id', 'user_id', 'business_unit_id', 'is_primary']);
  const permissionSet = o.permissionSet ?? 'brightrule_inquirer';
  const grants = await listAll(s, 'sys_user_permission_set', ['id', 'user_id', 'permission_set']);
  for (const p of corpus.personas) {
    const userId = await ensureAccount(s, p.email, p.name, userByEmail.get(p.email.toLowerCase()), o);
    const mine = members.filter((m) => str(m.user_id) === userId);
    const unitId = p.unit ? unitIds.get(p.unit) : undefined;
    if (p.unit && !unitId) throw new Error(`persona ${p.id}: unit ${p.unit} is not in the corpus`);
    for (const m of mine) {
      if (unitId && str(m.business_unit_id) === unitId) continue;
      const d = await call(s, 'DELETE', `/api/v1/data/sys_business_unit_member/${m.id}`);
      if (!d.ok) throw failure(`remove membership of ${p.id}`, d);
    }
    const kept = unitId ? mine.find((m) => str(m.business_unit_id) === unitId) : undefined;
    if (unitId && !kept) {
      const a = await call(s, 'POST', '/api/v1/data/sys_business_unit_member', { user_id: userId, business_unit_id: unitId, is_primary: true });
      if (!a.ok) throw failure(`add ${p.id} to ${p.unit}`, a);
    } else if (kept && kept.is_primary !== true) {
      const a = await call(s, 'PATCH', `/api/v1/data/sys_business_unit_member/${kept.id}`, { is_primary: true });
      if (!a.ok) throw failure(`make ${p.unit} primary for ${p.id}`, a);
    }
    if (!grants.some((g) => str(g.user_id) === userId && g.permission_set === permissionSet)) {
      const a = await call(s, 'POST', '/api/v1/data/sys_user_permission_set', { user_id: userId, permission_set: permissionSet });
      if (!a.ok) throw failure(`grant ${permissionSet} to ${p.id}`, a);
    }
    const seat = await call(s, 'POST', `/api/v1/actions/sys_user/assign_ai_seat/${encodeURIComponent(userId)}`, {});
    if (!seat.ok) warnings.push(`AI seat for ${p.id}: HTTP ${seat.status} ${JSON.stringify(seat.json).slice(0, 160)}`);
  }
  o.log(`personas: ${corpus.personas.length} accounts with their units and ${permissionSet}`);
}

async function loadPolicies(s: Session, corpus: Corpus, unitIds: Map<string, string>, o: SetupOptions) {
  const existing = await listAll(s, 'brightrule_policy', ['id', 'policy_no']);
  const idByKey = new Map<string, string>();
  for (const r of existing) if (typeof r.policy_no === 'string' && r.policy_no) idByKey.set(r.policy_no, String(r.id));
  let created = 0;
  let updated = 0;
  let done = 0;
  await pool(corpus.policies, o.concurrency, async (p) => {
    const unitId = unitIds.get(p.unit);
    if (!unitId) throw new Error(`policy ${p.key}: unit ${p.unit} is not in the corpus`);
    const row = policyRow(p, unitId);
    const id = idByKey.get(p.key);
    if (id) {
      const a = await call(s, 'PATCH', `/api/v1/data/brightrule_policy/${id}`, row);
      if (!a.ok) throw failure(`update policy ${p.key}`, a);
      updated++;
    } else {
      const a = await call(s, 'POST', '/api/v1/data/brightrule_policy', row);
      if (!a.ok) throw failure(`create policy ${p.key}`, a);
      const newId = idOf(a.json);
      if (!newId) throw new Error(`create policy ${p.key}: no id in the answer`);
      idByKey.set(p.key, newId);
      created++;
    }
    if (++done % 200 === 0) o.log(`policies: ${done}/${corpus.policies.length}`);
  });
  const withParent = corpus.policies.filter((p) => p.parent);
  await pool(withParent, o.concurrency, async (p) => {
    const parentId = idByKey.get(p.parent!);
    if (!parentId) throw new Error(`policy ${p.key}: parent ${p.parent} is not in the corpus`);
    const a = await call(s, 'PATCH', `/api/v1/data/brightrule_policy/${idByKey.get(p.key)}`, { parent_policy: parentId });
    if (!a.ok) throw failure(`link ${p.key} to ${p.parent}`, a);
  });
  o.log(`policies: ${created} created, ${updated} updated, ${withParent.length} 上级制度 links`);

  const atts = await listAll(s, 'brightrule_policy_attachment', ['id', 'policy', 'sort_no']);
  const attId = new Map(atts.map((a) => [`${str(a.policy)}#${a.sort_no}`, String(a.id)]));
  const jobs = corpus.policies.flatMap((p) => p.attachments.map((att) => ({ p, att })));
  await pool(jobs, o.concurrency, async ({ p, att }) => {
    const policyId = idByKey.get(p.key)!;
    const row = { policy: policyId, title: att.title, label: att.label, sort_no: att.sort_no, body_md: att.body_md ?? null, has_images: false, ...textStats(att.body_md) };
    const id = attId.get(`${policyId}#${att.sort_no}`);
    const a = id
      ? await call(s, 'PATCH', `/api/v1/data/brightrule_policy_attachment/${id}`, row)
      : await call(s, 'POST', '/api/v1/data/brightrule_policy_attachment', row);
    if (!a.ok) throw failure(`attachment ${att.label} of ${p.key}`, a);
  });
  o.log(`attachments: ${jobs.length} in place`);
  return { created, updated, attachments: jobs.length };
}

export async function setupEnvironment(corpus: Corpus, o: SetupOptions): Promise<SetupResult> {
  const warnings: string[] = [];
  const unitIds = await upsertUnits(o.admin, corpus, o);
  await setupPersonas(o.admin, corpus, unitIds, o, warnings);
  const loaded = o.skipPolicies ? { created: 0, updated: 0, attachments: 0 } : await loadPolicies(o.admin, corpus, unitIds, o);
  return {
    units: corpus.units.length,
    personas: corpus.personas.length,
    policies: { created: loaded.created, updated: loaded.updated },
    attachments: loaded.attachments,
    warnings,
  };
}

/** The environment's policies, as the resolver the trajectory mapping needs. */
export async function policyIds(s: Session, corpus: Corpus): Promise<{ byId: Map<string, string>; idOfKey: Map<string, string>; missing: string[] }> {
  const keys = new Set(corpus.policies.map((p) => p.key));
  const rows = await listAll(s, 'brightrule_policy', ['id', 'policy_no']);
  const byId = new Map<string, string>();
  const idOfKey = new Map<string, string>();
  for (const r of rows) {
    if (typeof r.policy_no !== 'string' || !keys.has(r.policy_no)) continue;
    byId.set(String(r.id), r.policy_no);
    idOfKey.set(r.policy_no, String(r.id));
  }
  return { byId, idOfKey, missing: [...keys].filter((k) => !idOfKey.has(k)) };
}
