import { defineHook } from '@objectstack/spec/data';

/**
 * 制度条款同步 — keeps `brightrule_policy_clause` (the retrieval units the
 * knowledge source indexes) in step with a policy's body and attachments.
 *
 * A policy's clauses are recut whenever its body, title, unit or status
 * changes, and whenever one of its attachments is added, changed or removed.
 * Only a published policy has clauses; any other status clears them.
 *
 * The cut (general rules, no rule names a particular policy):
 * - a body with 「第X条」 articles: one article per clause; an article longer
 *   than MAX characters is cut by paragraph, each piece keeping its article;
 * - a body without articles: by heading, and inside a heading by leading
 *   numbers (4.6.7, 一、, （一）, 1、, 1）, ①) gathered to about TARGET characters;
 * - a heading line longer than 40 characters or with a full stop is text;
 * - a table stays with its article/section; a table over MAX characters is cut
 *   into row groups, each repeating the header and the sentence before it; a
 *   「注」 line right after a table stays with it;
 * - an attachment whose table puts 「附件N」/「附表N」 in its first cell starts a
 *   new attachment there (the source wrote several attachments in one file);
 * - every clause begins with 【单位｜制度名｜附件N《名称》】章 > 节 > 条.
 *
 * Writes go in place by sequence (update, then insert the new tail, then
 * delete the leftover tail), so an edit does not send every clause to the
 * recycle bin. The source is one string shared by both hooks; the test runs it
 * against a fake `ctx` (src/qa/__tests__/policy-clause.test.ts).
 */
export const CLAUSE_SYNC_SOURCE = `
const MAX = 800, TARGET = 500;
const isAtt = ctx.object === 'brightrule_policy_attachment';
const pick = (o, k) => (o && o[k] && typeof o[k] === 'object' ? o[k].id : o && o[k]);
let policyId;
if (isAtt) {
  policyId = pick(ctx.result, 'policy') || pick(ctx.input, 'policy') || pick(ctx.previous, 'policy');
  if (!policyId && ctx.result && ctx.result.id) {
    const a = await ctx.api.object('brightrule_policy_attachment').findOne({ where: { id: ctx.result.id } });
    policyId = pick(a, 'policy');
  }
} else {
  const inp = ctx.input || {};
  if (ctx.event === 'afterUpdate' && !['body_md', 'title', 'owning_unit', 'status'].some((k) => k in inp)) return;
  policyId = (ctx.result && ctx.result.id) || (ctx.previous && ctx.previous.id) || inp.id;
}
if (!policyId) return;
const clauses = ctx.api.object('brightrule_policy_clause');
const existing = await clauses.find({ where: { policy: policyId }, fields: ['id', 'seq'], orderBy: [{ field: 'seq', order: 'asc' }], limit: 5000 });
const policy = ctx.event === 'afterDelete' && !isAtt ? null
  : await ctx.api.object('brightrule_policy').findOne({ where: { id: policyId } });
let rows = [];
if (policy && policy.status === 'published') {
  const unitId = pick(policy, 'owning_unit');
  let unitName = '';
  if (unitId) {
    const u = await ctx.api.object('sys_business_unit').findOne({ where: { id: unitId } });
    unitName = (u && u.name) || '';
  }
  const ART = /^\\s*\\*{0,2}\\s*(第[一二三四五六七八九十百零〇两\\d]+条)\\s*\\*{0,2}/;
  const NUM = /^\\s*(\\d+(?:\\.\\d+){1,4}|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|\\d+[、.．]|\\d+）|[①②③④⑤⑥⑦⑧⑨⑩])\\s*\\S/;
  const HEAD = /^(#{1,6})\\s+(.*)$/;
  const EMBED = /^\\s*\\|\\s*(?:\\|\\s*)*#?\\s*(附[件表]\\s*\\d+)\\s*(?:<br>|[:：\\s])\\s*([^|<]{0,60})/;
  const SEP = /^\\s*\\|[\\s\\-:|]+\\|\\s*$/;
  const NOTE = /^\\s*[（(]?注/;
  const realHead = (t) => { t = t.trim(); return t.length > 0 && t.length <= 40 && t.indexOf('。') < 0; };
  const chunks = (lines) => {
    const out = []; let cur = []; let i = 0;
    const flush = () => { const t = cur.join('\\n').trim(); if (t) out.push(t); cur = []; };
    while (i < lines.length) {
      const ln = lines[i];
      if (ln.trimStart().startsWith('|')) {
        const tbl = [];
        while (i < lines.length && lines[i].trimStart().startsWith('|')) { tbl.push(lines[i]); i++; }
        while (i < lines.length && (!lines[i].trim() || NOTE.test(lines[i]))) {
          if (lines[i].trim()) tbl.push(lines[i]);
          i++;
          if (i < lines.length && lines[i].trim() && !NOTE.test(lines[i])) break;
        }
        const ttxt = tbl.join('\\n');
        if (cur.join('\\n').length + ttxt.length <= MAX) { cur.push(...tbl); continue; }
        let intro = '';
        for (let k = cur.length - 1; k >= 0; k--) { if (cur[k].trim() && !cur[k].trimStart().startsWith('|')) { intro = cur[k]; break; } }
        flush();
        const head = tbl.length > 1 && SEP.test(tbl[1]) ? tbl.slice(0, 2) : tbl.slice(0, 1);
        const body = tbl.slice(head.length);
        let grp = [];
        for (const row of body) {
          if (head.concat(grp, [row]).join('\\n').length + intro.length > MAX && grp.length) {
            out.push((intro ? [intro] : []).concat(head, grp).join('\\n')); grp = [];
          }
          grp.push(row);
        }
        if (grp.length || !body.length) out.push((intro ? [intro] : []).concat(head, grp).join('\\n'));
        continue;
      }
      if (cur.join('\\n').length + ln.length > MAX && cur.length) flush();
      cur.push(ln); i++;
    }
    flush();
    return out;
  };
  const splitDoc = (md) => {
    const lines = (md || '').split('\\n');
    const hasArt = lines.some((l) => ART.test(l));
    const heads = {}; const units = []; let cur = null;
    const start = (path, kind) => { cur = [path, kind, []]; units.push(cur); };
    const headPath = () => Object.keys(heads).map(Number).sort((a, b) => a - b).map((k) => heads[k]);
    start([], 'section');
    for (let ln of lines) {
      const m = HEAD.exec(ln);
      if (m && realHead(m[2])) {
        const lvl = m[1].length; const txt = m[2].trim().replace(/^\\*+|\\*+$/g, '');
        for (const k of Object.keys(heads)) if (Number(k) >= lvl) delete heads[k];
        heads[lvl] = txt; start(headPath(), 'section'); continue;
      }
      if (m) ln = m[2];
      const a = ART.exec(ln);
      if (hasArt && a) { start(headPath().concat([a[1]]), 'article'); cur[2].push(ln); continue; }
      const n = NUM.exec(ln);
      if (!hasArt && n && cur[2].join('\\n').length >= TARGET) start(headPath().concat([n[1]]), 'section');
      cur[2].push(ln);
    }
    const out = [];
    for (const [path, kind, ls] of units) {
      const body = ls.join('\\n').trim();
      if (!body) continue;
      const pieces = body.length > MAX ? chunks(ls) : [body];
      for (const p of pieces) {
        const isTable = (p.match(/\\n\\|/g) || []).length >= 2 && p.replace(/\\|[^\\n]*/g, '').trim().length < 40;
        out.push([path, isTable ? 'table' : kind, p]);
      }
    }
    const merged = []; let carry = '';
    for (let [path, kind, text] of out) {
      if (carry) { text = carry + '\\n' + text; carry = ''; }
      if (text.length < 30 && kind !== 'article') { carry = text; continue; }
      merged.push([path, kind, text]);
    }
    if (carry && merged.length) merged[merged.length - 1][2] += '\\n' + carry;
    else if (carry) merged.push([[], 'section', carry]);
    return merged;
  };
  const docs = [['body', null, null, policy.body_md]];
  const atts = await ctx.api.object('brightrule_policy_attachment').find({
    where: { policy: policyId }, fields: ['label', 'title', 'body_md', 'sort_no'], orderBy: [{ field: 'sort_no', order: 'asc' }], limit: 500,
  });
  for (const a of atts) {
    let label = a.label, title = a.title, buf = [];
    for (const ln of (a.body_md || '').split('\\n')) {
      const m = EMBED.exec(ln);
      if (m && m[1].replace(/ /g, '') !== (label || '').replace(/ /g, '')) {
        docs.push(['attachment', label, title, buf.join('\\n')]);
        label = m[1].replace(/ /g, ''); title = m[2].trim() || m[1]; buf = [];
      }
      buf.push(ln);
    }
    docs.push(['attachment', label, title, buf.join('\\n')]);
  }
  const hash = (s) => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; } return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + s.length.toString(16); };
  let seq = 0;
  for (const [origin, alabel, atitle, md] of docs) {
    if (!md || !md.trim()) continue;
    const src = origin === 'attachment' ? (alabel || '') + '《' + (atitle || '') + '》' : '';
    for (let [path, kind, text] of splitDoc(md)) {
      seq++;
      if (origin === 'attachment' && kind !== 'article' && text.replace(/[|\\-:\\s]/g, '').length < 60) kind = 'form';
      const prefix = '【' + [unitName, policy.title, src].filter(Boolean).join('｜') + '】' + path.join(' > ');
      rows.push({
        title: (path.length ? path[path.length - 1] : (alabel || '正文')).slice(0, 200),
        policy: policyId, owning_unit: unitId || null, origin, attachment_label: alabel || null,
        path: path.join(' > ').slice(0, 500), kind, seq,
        section_key: (policyId + '|' + (alabel || '') + '|' + (kind === 'article' ? path.slice(0, -1) : path).join(' > ')).slice(0, 300),
        clause_hash: hash(text.replace(/\\s+/g, '')),
        content: prefix + '\\n' + text,
      });
    }
  }
}
for (let i = 0; i < rows.length; i++) {
  if (i < existing.length) await clauses.update(Object.assign({ id: existing[i].id }, rows[i]));
  else await clauses.insert(rows[i]);
}
const extra = existing.slice(rows.length).map((r) => r.id);
if (extra.length) await clauses.delete({ where: { id: { $in: extra } }, multi: true });
`;

const BODY = { language: 'js' as const, source: CLAUSE_SYNC_SOURCE, capabilities: ['api.read' as const, 'api.write' as const], timeoutMs: 30000 };

/** A policy's body, title, unit or status changed: recut its clauses. */
export const PolicyClauseSyncHook = defineHook({
  name: 'brightrule_policy_clause_sync',
  object: 'brightrule_policy',
  events: ['afterInsert', 'afterUpdate'],
  runAs: 'system',
  body: BODY,
  onError: 'log',
});

/** An attachment was added, changed or removed: recut its policy's clauses. */
export const PolicyAttachmentClauseSyncHook = defineHook({
  name: 'brightrule_attachment_clause_sync',
  object: 'brightrule_policy_attachment',
  events: ['afterInsert', 'afterUpdate', 'afterDelete'],
  runAs: 'system',
  body: BODY,
  onError: 'log',
});
