import { defineSeed, seedFile } from '@objectstack/spec/data';
import { Policy } from '../objects/policy.object.js';
import { PolicyVersion } from '../objects/policy-version.object.js';
import { PolicyAttachment } from '../objects/policy-attachment.object.js';
import { PolicyRelation } from '../objects/policy-relation.object.js';
import { Clause } from '../objects/clause.object.js';
import { assembleBody, textStats } from './document-text.js';

// Sample policies — fictional demo data, loaded in dev and test only (never in
// production). Lookups name their parent by its seed key (`title`).
// A policy's `current_version` is not seeded: it points at a version, which is
// seeded after the policy, and the version hook fills it when the current
// version is written (src/qa/version-current.hook.ts).
// No inquiries are seeded: an inquiry is answered when it is saved, so the
// demo asks its questions against the running app.

const T = '差旅费报销管理办法';
const L = '考勤与休假管理制度';
const S = '信息安全管理规定';
const G = '反商业贿赂与利益冲突管理规定';
const C = '合同管理办法';

const policies = defineSeed(Policy, {
  env: ['dev', 'test'],
  externalId: 'title',
  records: [
    { title: T, policy_no: 'FIN-001', issuing_unit: '集团', category: 'finance', department: '财务部', status: 'published', effective_date: '2026-07-01', next_review_date: '2027-06-30', summary: '国内出差的住宿、交通、补贴标准与报销要求。' },
    { title: L, policy_no: 'HR-002', issuing_unit: '集团', category: 'hr', department: '人力资源部', status: 'published', effective_date: '2026-03-01', next_review_date: '2027-02-28', summary: '工作时间、请假类型、年休假与审批权限。' },
    { title: S, policy_no: 'IT-003', issuing_unit: '集团', category: 'it', department: '信息技术部', status: 'published', effective_date: '2026-05-15', next_review_date: '2026-12-15', summary: '账号口令、数据分级与外部工具使用要求。' },
    { title: G, policy_no: 'CMP-004', issuing_unit: '集团', category: 'compliance', department: '合规部', status: 'published', effective_date: '2026-04-01', next_review_date: '2027-03-31', summary: '礼品礼金收受标准与利益冲突申报。' },
    { title: C, policy_no: 'CMP-005', issuing_unit: '集团', category: 'compliance', department: '法务部', status: 'published', effective_date: '2026-06-01', next_review_date: '2027-05-31', summary: '合同起草、审查、签署与归档。' },
  ],
});

/** The sample versions; each one's body is assembled from its clauses below. */
const VERSION_ROWS = [
    { title: `${T} V2.0`, policy: T, version_no: 'V2.0', version_status: 'superseded', effective_date: '2024-07-01', change_note: '旧版本，已被 V3.0 替代。' },
    { title: `${T} V3.0`, policy: T, version_no: 'V3.0', version_status: 'current', effective_date: '2026-07-01', change_note: '上调一线城市住宿标准，新增网约车报销规定。' },
    { title: `${L} V2.1`, policy: L, version_no: 'V2.1', version_status: 'current', effective_date: '2026-03-01', change_note: '明确年休假天数与病假审批。' },
    { title: `${S} V1.2`, policy: S, version_no: 'V1.2', version_status: 'current', effective_date: '2026-05-15', change_note: '新增外部 AI 工具使用条款。' },
    { title: `${G} V1.1`, policy: G, version_no: 'V1.1', version_status: 'current', effective_date: '2026-04-01', change_note: '明确礼品价值上限。' },
    { title: `${C} V2.0`, policy: C, version_no: 'V2.0', version_status: 'current', effective_date: '2026-06-01', change_note: '调整法务审查门槛。' },
];

type ClauseRow = [policy: string, version: string, no: string, title: string, content: string, keywords: string];

/** The sample clauses; `is_current` follows the version's status. */
const CLAUSES: ClauseRow[] = [
  [T, 'V2.0', '第五条', '住宿标准', '一线城市住宿标准为每晚不超过 500 元，其他城市不超过 350 元。', '住宿 酒店 标准'],
  [T, 'V3.0', '第五条', '住宿标准', '一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元，其他城市不超过 400 元，超标部分由个人承担。', '住宿 酒店 标准 出差'],
  [T, 'V3.0', '第八条', '伙食补贴', '出差伙食补贴每人每天 100 元，按实际出差天数计算，不再另行报销餐费。', '补贴 餐费 伙食'],
  [T, 'V3.0', '第十一条', '网约车报销', '出差期间市内交通可乘坐网约车，凭电子发票及行程单报销，单日不超过 150 元。', '网约车 打车 交通 报销'],
  [L, 'V2.1', '第十二条', '年休假天数', '员工累计工作满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，年休假 10 天；满 20 年的，年休假 15 天。', '年假 年休假 休假'],
  [L, 'V2.1', '第十五条', '病假', '病假须提供二级以上医院诊断证明；连续病假 3 天以内由部门负责人审批，3 天以上须部门负责人及人力资源部审批。', '病假 请假 审批'],
  [S, 'V1.2', '第六条', '口令要求', '系统口令长度不少于 12 位，须包含大小写字母、数字及特殊字符，每 90 天更换一次。', '密码 口令'],
  [S, 'V1.2', '第九条', '外部 AI 工具', '禁止将内部及以上密级数据上传至未经信息技术部批准的外部网盘、翻译或 AI 工具。', 'AI 工具 数据外发 网盘 翻译'],
  [G, 'V1.1', '第七条', '礼品收受', '员工不得收受价值超过 200 元的礼品；无法拒绝的，须在 3 个工作日内上交合规部登记。', '礼品 礼金 收礼'],
  [C, 'V2.0', '第十五条', '法务审查', '合同金额 50 万元以上，或违约金超过合同金额 20% 的，须经法务部审查后方可签署。', '合同 法务 审查 签署'],
];

const isCurrentVersion = (title: string) =>
  VERSION_ROWS.some((v) => v.title === title && v.version_status === 'current');

const clauses = defineSeed(Clause, {
  env: ['dev', 'test'],
  externalId: 'title',
  records: CLAUSES.map(([policy, version, no, title, content, keywords]) => ({
    title: `${policy} ${version} ${no} ${title}`,
    policy,
    policy_version: `${policy} ${version}`,
    citation: `《${policy}》${version} ${no}`,
    content,
    keywords,
    is_current: isCurrentVersion(`${policy} ${version}`),
  })),
});

// ── 版本正文与附件 ──────────────────────────────────────────────────────────
// Each version's body (`body_md`) is assembled from that version's clauses;
// 差旅费报销管理办法 V3.0 also has two attachments. Every body and attachment
// carries an original file. This repository is public and ships no real policy
// and no docx / PDF (brightrule#4), so each original is a SYNTHETIC plain-text
// placeholder under fixtures/originals/, marked 合成示例 in its first line,
// written into the file field with `seedFile` (the build bundles the bytes).
// `content_hash` is the SHA-256 of those bytes; seed-documents.test.ts checks
// every hash against its file.

/** An original placeholder: package-relative path, download name, SHA-256 of its bytes. */
const original = (path: string, name: string, sha256: string) => ({
  original_file: seedFile(path, { name }),
  content_hash: sha256,
});

/** SHA-256 of each placeholder in fixtures/originals/, by file name. */
const ORIGINAL_SHA256: Record<string, string> = {
  'travel-v2.0-body.txt': '76e0219ffca8171261d7851a60933bdf0a2cb5fcd2feb293c9a51e30e61d922a',
  'travel-v3.0-body.txt': 'eb98ffb144afe7f1ac6c8ba7e44aa8032fb003f8c9bd39531b211942d2a3cfed',
  'travel-v3.0-attachment-1.txt': 'd6d21d1b28e90cee51a2ccd4a2505699394e2d07bd0409de5a48993eda0a6088',
  'travel-v3.0-attachment-2.txt': '5706f888b8477c182e0d1db8a925cad7b8cd26e08daabecc156e69a1b70ed2a5',
  'leave-v2.1-body.txt': '2b02b163db97cff955ba91b2b725d94cd4c16042dfd83bd7848d758a1a630201',
  'security-v1.2-body.txt': '924916d0d2d2bac37909433af30cdc8186915287eae095db33246c0f431eba42',
  'gifts-v1.1-body.txt': '21671841ed2e1b3da94d230c597f45dc17c735c07c41f7bdd1f4a3ffebf57064',
  'contract-v2.0-body.txt': '55ddba3721866c4a928e4b188059b88d235ffd45ccc80108c71afc0282f854bb',
};

/** The file-name stem of each sample policy's placeholders. */
const FILE_STEM: Record<string, string> = { [T]: 'travel', [L]: 'leave', [S]: 'security', [G]: 'gifts', [C]: 'contract' };

const originalOf = (file: string, name: string) =>
  original(`fixtures/originals/${file}`, name, ORIGINAL_SHA256[file]);

/** A version row with its body: Markdown, article index and sizes (its original is seeded apart, below). */
const withBody = (v: (typeof VERSION_ROWS)[number]) => {
  const { markdown, articleIndex } = assembleBody(
    `${v.policy}（${v.version_no}）`,
    CLAUSES.filter(([p, ver]) => p === v.policy && ver === v.version_no).map(([, , no, title, text]) => ({ no, title, text })),
  );
  const { text_chars, text_tokens } = textStats(markdown);
  return {
    ...v,
    body_md: markdown,
    article_index: articleIndex,
    text_chars,
    text_tokens,
  };
};

const versions = defineSeed(PolicyVersion, {
  env: ['dev', 'test'],
  externalId: 'title',
  records: VERSION_ROWS.map(withBody),
});

// The body originals, as a dataset of their own that only fills two columns of
// the versions above. A seed file exists only in a built package: a load from
// source (vitest's stack) refuses the dataset that names one, and a version
// row that carried its file would take every clause and relation down with it.
const versionOriginals = defineSeed(PolicyVersion, {
  env: ['dev', 'test'],
  externalId: 'title',
  mode: 'update',
  records: VERSION_ROWS.map((v) => ({
    title: v.title,
    ...originalOf(`${FILE_STEM[v.policy]}-${v.version_no.toLowerCase()}-body.txt`, `${v.title}（合成示例原件）.txt`),
  })),
});

/** 附件 1 — a normative attachment: its table is part of the rule, so the AI reads it. */
const LODGING_TABLE = [
  '# 附件 1 住宿标准表',
  '',
  '| 城市类别 | 城市 | 每晚上限（元） |',
  '|---|---|---|',
  '| 一线城市 | 北京、上海、广州、深圳 | 600 |',
  '| 其他城市 | 一线城市以外的城市 | 400 |',
  '',
  '超标部分由个人承担。',
  '',
].join('\n');

const T3 = `${T} V3.0`;
// An attachment's title is its own name, so it is unique only within its
// version: the seed key is the version and the number.
const attachments = defineSeed(PolicyAttachment, {
  env: ['dev', 'test'],
  externalId: ['policy_version', 'sort_no'],
  records: [
    {
      title: '住宿标准表',
      label: '附件1',
      policy_version: T3,
      policy: T,
      attachment_class: 'normative',
      sort_no: 1,
      body_md: LODGING_TABLE,
      ...textStats(LODGING_TABLE),
      is_current: true,
      ...originalOf('travel-v3.0-attachment-1.txt', `${T3} 附件1 住宿标准表（合成示例原件）.txt`),
    },
    {
      // A form people fill in: only the original, nothing for the AI.
      title: '出差审批单',
      label: '附件2',
      policy_version: T3,
      policy: T,
      attachment_class: 'form',
      sort_no: 2,
      ...textStats(undefined),
      is_current: true,
      ...originalOf('travel-v3.0-attachment-2.txt', `${T3} 附件2 出差审批单（合成示例原件）.txt`),
    },
  ],
});

// ── 制度关系 ────────────────────────────────────────────────────────────────
// Links from a version to other policies. `from_policy` is left to the
// relation hook (filled from the version). One target is outside the library
// (to_policy empty, named only by to_title), one relation is unconfirmed — it
// shows in 待确认关系 — and one links two library policies. All names are the
// synthetic sample policies above or invented titles.
const relations = defineSeed(PolicyRelation, {
  env: ['dev', 'test'],
  externalId: ['from_version', 'relation_type', 'to_title'],
  records: [
    {
      // Outside the library: only the name is known.
      from_version: T3,
      relation_type: 'cites',
      to_title: '《费用报销管理规定》',
      from_articles: '第十一条',
      confirmed: true,
      source: 'manual',
    },
    {
      // Two library policies.
      from_version: T3,
      relation_type: 'cites',
      to_policy: L,
      to_title: `《${L}》`,
      from_articles: '第八条',
      confirmed: true,
      source: 'manual',
    },
    {
      // Extracted on import, waiting for a maintainer.
      from_version: `${C} V2.0`,
      relation_type: 'cites',
      to_policy: G,
      to_title: `《${G}》`,
      from_articles: '第十五条',
      confirmed: false,
      source: 'extracted',
    },
  ],
});

export const BrightRuleSeedData = [policies, versions, versionOriginals, attachments, clauses, relations];
