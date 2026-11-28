/**
 * A small client for the endpoints the driver uses (brightrule#69 PR-B):
 * email sign-in, the data API, conversations and the `ask` agent's chat route.
 * The same calls the console makes, so a run sees what an employee sees —
 * above all the 提问人 block (cloud#5099), which the platform gives only to a
 * signed-in session, never to an API key or MCP.
 */

export interface Session {
  baseUrl: string;
  /** The session cookie of a signed-in account. */
  cookie: string;
}

export interface ApiAnswer {
  ok: boolean;
  status: number;
  json: unknown;
}

const originOf = (baseUrl: string) => new URL(baseUrl).origin;

export async function call(s: Session, method: string, path: string, body?: unknown): Promise<ApiAnswer> {
  const res = await fetch(`${s.baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: originOf(s.baseUrl), cookie: s.cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

/** Sign in with email and password; the answer is the session cookie. */
export async function signIn(baseUrl: string, email: string, password: string): Promise<Session> {
  const res = await fetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: originOf(baseUrl) },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${email}: HTTP ${res.status}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`sign-in ${email}: no session cookie in the answer`);
  return { baseUrl, cookie };
}

/** A short, readable error for a failed call. */
export function failure(what: string, a: ApiAnswer): Error {
  return new Error(`${what}: HTTP ${a.status} ${JSON.stringify(a.json).slice(0, 300)}`);
}

/** The rows of a data-API list answer, whichever envelope it comes in. */
export function rowsOf(json: unknown): Record<string, unknown>[] {
  const j = json as Record<string, unknown> | null;
  const candidates = [j, j?.data, j?.records, (j?.data as Record<string, unknown> | undefined)?.records, j?.items, j?.value];
  for (const c of candidates) if (Array.isArray(c)) return c as Record<string, unknown>[];
  throw new Error(`not a list answer: ${JSON.stringify(json).slice(0, 200)}`);
}

/** The id of a created record, whichever envelope it comes in. */
export function idOf(json: unknown): string | undefined {
  const j = json as Record<string, unknown> | null;
  const id = (j?.data as Record<string, unknown> | undefined)?.id ?? j?.id ?? ((j?.data as Record<string, unknown> | undefined)?.record as Record<string, unknown> | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Every row of an object, page by page (`limit` + `skip`). Stops at a short page, or when a page
 * brings no new id (an endpoint that ignored `skip` would answer the first page again).
 */
export async function listAll(s: Session, object: string, fields?: string[], pageSize = 200): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < 10_000; page++) {
    const qs = new URLSearchParams({ limit: String(pageSize), skip: String(page * pageSize) });
    if (fields) qs.set('fields', fields.join(','));
    const a = await call(s, 'GET', `/api/v1/data/${object}?${qs}`);
    if (!a.ok) throw failure(`list ${object}`, a);
    const batch = rowsOf(a.json);
    let fresh = 0;
    for (const r of batch) {
      const id = String(r.id ?? '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(r);
      fresh++;
    }
    if (batch.length < pageSize || fresh === 0) break;
  }
  return rows;
}

/** Run `fn` over `items` with at most `n` in flight. */
export async function pool<T, R>(items: readonly T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}
