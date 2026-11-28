/**
 * A turn's tool calls, as the grader reads them: which policies each call
 * returned, named by corpus key (`policy_no`) instead of record id.
 */
import type { z } from 'zod';
import type { ArticleRef, ToolCall } from '../schema.js';
import type { TurnToolCall } from './chat.js';

const POLICY = 'brightrule_policy';
type ToolCallT = z.infer<typeof ToolCall>;
type ArticleRefT = z.infer<typeof ArticleRef>;

/** Maps a record id (or a `policy_no`) back to the corpus key. */
export interface KeyResolver {
  byId: ReadonlyMap<string, string>;
  keys: ReadonlySet<string>;
}

/** The policy keys a value holds, in the order they appear: rows by id, or by `policy_no`. */
export function policyKeysIn(value: unknown, r: KeyResolver): string[] {
  const out: string[] = [];
  const add = (k: string | undefined) => {
    if (k && !out.includes(k)) out.push(k);
  };
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string') add(r.byId.get(o.id));
    if (typeof o.policy_no === 'string' && r.keys.has(o.policy_no)) add(o.policy_no);
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  walk(value, 0);
  return out;
}

/**
 * A tool output as the stream carries it: the AI SDK's `{ type: 'text', value }`
 * wrapper around the tool's JSON, or `{ type: 'json', value }`, or the bare
 * value. Answers the tool's own value, parsed when it is JSON text.
 */
export function unwrapOutput(output: unknown): unknown {
  let v = output;
  for (let i = 0; i < 3; i++) {
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
        continue;
      } catch {
        return v;
      }
    }
    const o = v as Record<string, unknown> | null;
    if (o && typeof o === 'object' && !Array.isArray(o) && (o.type === 'text' || o.type === 'json') && 'value' in o && Object.keys(o).length <= 3) {
      v = o.value;
      continue;
    }
    return v;
  }
  return v;
}

const failed = (output: unknown) => {
  if (output === undefined) return true;
  const o = output as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && !Array.isArray(o) && (o.ok === false || (o.error !== undefined && o.error !== null));
};

const argsOf = (input: unknown) => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {});

/** The rows of a query answer that carry a body: reading them reads the policy. */
function rowsWithBody(output: unknown, r: KeyResolver): string[] {
  const rows = (output as { records?: unknown } | null)?.records;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => typeof (row as { body_md?: unknown })?.body_md === 'string' && (row as { body_md: string }).body_md.length > 0).flatMap((row) => policyKeysIn(row, r).slice(0, 1));
}

/**
 * - `get_record` of brightrule_policy: the record read (its id, mapped to a key);
 * - `get_record_context`: the pack of the pinned record, read in full;
 * - `query_records` of brightrule_policy: the catalog rows returned, in order;
 *   rows that came back with their body (`body_md` among the fields) count as
 *   read too.
 * A call that failed (the tool answered `{ error }`) or returned nothing reads nothing.
 */
export function toToolCalls(calls: readonly TurnToolCall[], r: KeyResolver): ToolCallT[] {
  return calls.map((c) => {
    const args = argsOf(c.input);
    const object = args.objectName ?? args.object;
    const output = unwrapOutput(c.output);
    let read: string[] = [];
    let listed: string[] = [];
    if (!failed(output)) {
      if (c.toolName === 'get_record' && object === POLICY) {
        const byArg = typeof args.recordId === 'string' ? r.byId.get(args.recordId) : undefined;
        read = byArg ? [byArg] : policyKeysIn(output, r).slice(0, 1);
      } else if (c.toolName === 'get_record_context') {
        read = policyKeysIn(output, r).slice(0, 1);
      } else if (c.toolName === 'search_knowledge') {
        // Each hit's snippet is a clause of its policy, read as it stands:
        // the policies whose clauses came back are listed and read, in rank
        // order (a clause id maps to its policy when the resolver knows it).
        listed = policyKeysIn(output, r);
        read = listed;
      } else if (c.toolName === 'query_records' && object === POLICY) {
        listed = policyKeysIn(output, r);
        read = rowsWithBody(output, r);
      }
    }
    return { tool: c.toolName, args: c.input, read_policies: read, listed_policies: listed };
  });
}

const ARTICLE = /第[零〇一二两三四五六七八九十百\d]+条|Article\s+\d+|附件\s*\d+|附表\s*\d+|Appendix\s+\d+/i;

/**
 * Retrieval hits of a `search_knowledge` call (vector / hybrid routes), in
 * rank order: each hit's policy, and the article its chunk starts in when the
 * chunk names one. Best effort over the tool's output; the pure-retrieval
 * score (the question sent to retrieval without the model) needs the
 * platform's search API (objectstack#37306) and is not measured here.
 */
export function retrievalFrom(calls: readonly TurnToolCall[], r: KeyResolver): ArticleRefT[] | undefined {
  const searches = calls.filter((c) => c.toolName === 'search_knowledge' && !failed(unwrapOutput(c.output)));
  if (searches.length === 0) return undefined;
  const hits: ArticleRefT[] = [];
  for (const c of searches) {
    const o = unwrapOutput(c.output) as Record<string, unknown> | unknown[];
    const list = Array.isArray(o) ? o : ((o?.results ?? o?.hits ?? o?.chunks ?? o?.data ?? []) as unknown[]);
    for (const h of Array.isArray(list) ? list : []) {
      const [policy] = policyKeysIn(h, r);
      if (!policy) continue;
      const text = JSON.stringify(h);
      hits.push({ policy, article: text.match(ARTICLE)?.[0] ?? '' });
    }
  }
  return hits;
}
