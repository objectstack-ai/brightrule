#!/usr/bin/env node
// 制度按所属单位共享 — reconcile the per-unit sharing rules of brightrule_policy
// (brightrule#74, docs/visibility.md dimension 2 and section 8).
//
// The policy object is private. Each unit that owns at least one policy gets
// one sharing rule, which opens that unit's policies to the unit and every
// unit under it:
//
//   name        brightrule_policy_unit_<unit id, spelt by ruleNameFor()>
//   criteria    { owning_unit: '<unit id>' }
//   sharedWith  unit_and_subordinates '<unit id>'
//   access      read
//
// One rule per unit because the platform's `field` recipient only names user
// fields, so "share with the record's owning unit and below" cannot be one
// static rule; and the unit ids differ per environment, so the rules cannot be
// declared in src/. This script is that missing rule's stand-in.
//
// Idempotent: a rule that already says the above is left alone; a rule that
// differs is rewritten; a rule of this family (the name prefix) whose unit
// owns no policy any more is deleted. Rules outside the prefix are never
// touched. Moving units in the tree or moving users between units needs no
// run: the platform re-expands `unit_and_subordinates` itself.
//
// Run it after an import, and after a policy is moved to a unit that owned
// none before (until then that policy is hidden from employees — never
// leaked):
//
//   OS_URL=https://… OS_EMAIL=… OS_PASSWORD=… node scripts/sharing/policy-unit-sharing.mjs [--dry-run]
//   (or OS_TOKEN=… instead of OS_EMAIL / OS_PASSWORD)
//
// The caller must hold `manage_sharing` (the sharing-rule API refuses anyone
// else with 403) and must see every policy (a platform administrator, or a
// user who also holds 制度管理员): units are read from the policies the caller
// can see, so a caller who sees fewer would delete rules that are still needed.
// The script refuses to delete when it sees no policy at all.

/** The name prefix of the rules this script owns. Never reuse it by hand. */
export const RULE_PREFIX = 'brightrule_policy_unit_';
export const POLICY_OBJECT = 'brightrule_policy';

/**
 * The stable rule name of one unit: the prefix and the unit id, spelt in the
 * lower-case alphabet a rule name allows. Unit ids are case-sensitive
 * (`Qp9q-EI2f…`), so lower-casing alone could give two units one name; the
 * spelling is one-to-one instead: `a`–`z`, `0`–`9` stay, an upper-case letter
 * becomes `_` + the letter, `_` becomes `__`, `-` becomes `_0`, and any other
 * character `_1` + its six-digit hex code point. `Qp9q-EI2f` → `_qp9q_0_e_i2f`.
 */
export function ruleNameFor(unitId) {
  let out = '';
  for (const ch of String(unitId)) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[A-Z]/.test(ch)) out += '_' + ch.toLowerCase();
    else if (ch === '_') out += '__';
    else if (ch === '-') out += '_0';
    else out += '_1' + ch.codePointAt(0).toString(16).padStart(6, '0');
  }
  return RULE_PREFIX + out;
}

/** The rule one unit should have. */
export function desiredRule(unitId, unitName) {
  const named = unitName ? `「${unitName}」` : unitId;
  return {
    name: ruleNameFor(unitId),
    label: `制度按单位共享：${unitName ?? unitId}`,
    description:
      `所属单位为${named}的制度，共享给该单位及其下级单位的成员（只读）。` +
      `由 scripts/sharing/policy-unit-sharing.mjs 生成和删除，请勿手工修改（brightrule#74）。`,
    object: POLICY_OBJECT,
    criteria: { owning_unit: String(unitId) },
    recipientType: 'unit_and_subordinates',
    recipientId: String(unitId),
    accessLevel: 'read',
    active: true,
  };
}

const lookupId = (v) => (v && typeof v === 'object' ? v.id ?? v._id ?? null : v ?? null);

/** Does a stored rule (the API's row) already say what `want` says? */
export function ruleMatches(row, want) {
  const criteria = typeof row.criteria === 'string' ? safeJson(row.criteria) : row.criteria;
  return (
    row.object_name === want.object &&
    row.recipient_type === want.recipientType &&
    String(row.recipient_id) === want.recipientId &&
    row.access_level === want.accessLevel &&
    row.active !== false &&
    row.label === want.label &&
    (row.description ?? null) === want.description &&
    JSON.stringify(criteria) === JSON.stringify(want.criteria)
  );
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

async function call(request, method, path, body) {
  const res = await request(method, path, body);
  const text = res.status === 204 ? '' : await res.text();
  const json = text ? safeJson(text) : null;
  if (res.status >= 400) {
    throw new Error(`${method} ${path} → ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
}

/**
 * The units that own at least one policy the caller can see, with how many.
 * Pages through the policies (owning_unit only) to the first empty page, so it
 * needs no aggregate API.
 */
export async function owningUnits(request, { pageSize = 500 } = {}) {
  const counts = new Map();
  let total = 0;
  for (let skip = 0; ; ) {
    const page = await call(
      request,
      'GET',
      `/data/${POLICY_OBJECT}?fields=id,owning_unit&top=${pageSize}&skip=${skip}&sort=id`,
    );
    const rows = page?.records ?? page?.data ?? [];
    // Stop at the first empty page, not at the first short one: a server that
    // caps the page below `pageSize` must not end the count early (a unit
    // missed here would have its rule deleted).
    if (rows.length === 0) break;
    for (const r of rows) {
      total += 1;
      const id = lookupId(r.owning_unit);
      if (id) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
    }
    skip += rows.length;
  }
  return { counts, total };
}

async function unitNames(request, ids) {
  const names = new Map();
  for (const id of ids) {
    try {
      const r = await call(request, 'GET', `/data/sys_business_unit/${encodeURIComponent(id)}`);
      const rec = r?.record ?? r?.data ?? r;
      if (rec?.name) names.set(id, String(rec.name));
    } catch {
      // A name is only the label's courtesy: the rule is keyed by the id.
    }
  }
  return names;
}

/**
 * Bring the per-unit rules in line with the policies.
 *
 * `request(method, path, body)` performs one API call relative to `/api/v1`
 * as the operator and resolves to a fetch `Response`.
 *
 * Returns what it did (or, with `dryRun`, would do): rule names per bucket.
 */
export async function reconcilePolicyUnitRules(request, { dryRun = false, log = () => {} } = {}) {
  const { counts, total } = await owningUnits(request);
  const names = await unitNames(request, [...counts.keys()]);
  const listed = await call(request, 'GET', `/sharing/rules?object=${POLICY_OBJECT}`);
  const existing = new Map(
    (listed?.data ?? [])
      .filter((r) => typeof r.name === 'string' && r.name.startsWith(RULE_PREFIX))
      .map((r) => [r.name, r]),
  );

  const result = { policies: total, units: counts.size, created: [], updated: [], unchanged: [], removed: [] };
  const wanted = new Set();
  for (const unitId of [...counts.keys()].sort()) {
    const want = desiredRule(unitId, names.get(unitId));
    wanted.add(want.name);
    const row = existing.get(want.name);
    if (row && ruleMatches(row, want)) {
      result.unchanged.push(want.name);
      continue;
    }
    (row ? result.updated : result.created).push(want.name);
    log(`${row ? 'update' : 'create'} ${want.name} (${want.label}, ${counts.get(unitId)} 份制度)`);
    if (!dryRun) await call(request, 'POST', '/sharing/rules', want);
  }

  const stale = [...existing.keys()].filter((n) => !wanted.has(n)).sort();
  if (stale.length && total === 0) {
    throw new Error(
      `Saw no policy at all, so refusing to delete ${stale.length} rule(s): ` +
        'the caller must see every policy (platform administrator or 制度管理员).',
    );
  }
  for (const name of stale) {
    result.removed.push(name);
    log(`delete ${name}`);
    if (!dryRun) await call(request, 'DELETE', `/sharing/rules/${encodeURIComponent(name)}`);
  }
  return result;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const base = (process.env.OS_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', Origin: base };
  if (process.env.OS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.OS_TOKEN}`;
  } else if (process.env.OS_EMAIL && process.env.OS_PASSWORD) {
    const r = await fetch(`${base}/api/v1/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: process.env.OS_EMAIL, password: process.env.OS_PASSWORD }),
    });
    if (!r.ok) throw new Error(`sign-in failed: ${r.status}`);
    headers.Cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  } else {
    throw new Error('Set OS_TOKEN, or OS_EMAIL and OS_PASSWORD.');
  }
  const request = (method, path, body) =>
    fetch(`${base}/api/v1${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await reconcilePolicyUnitRules(request, { dryRun, log: (m) => console.log((dryRun ? '[dry-run] ' : '') + m) });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
}
