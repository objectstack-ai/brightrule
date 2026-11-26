import { defineSeed, seedFile } from '@objectstack/spec/data';
import { Policy } from '../objects/policy.object.js';
import { PolicyAttachment } from '../objects/policy-attachment.object.js';
import { PolicySuggestion } from '../objects/policy-suggestion.object.js';
import { assembleBody, textStats } from './document-text.js';

// Sample policies — fictional demo data, loaded in dev and test only (never in
// production). Lookups name their parent by its seed key (`title`; a business
// unit by its `name`).
// A policy carries its own body (brightrule#45: no versions); its only child
// is 制度附件. No inquiries are seeded: an inquiry is answered when it is
// saved, so the demo asks its questions against the running app.

const T = '差旅费报销管理办法';
const L = '考勤与休假管理制度';
const S = '信息安全管理规定';
const G = '反商业贿赂与利益冲突管理规定';
const C = '合同管理办法';
// Three policies of two subsidiaries (brightrule#52): one forwards a group
// policy, one follows another, and one is a trial policy of its own.
const FC = `关于转发《${C}》的通知`;
const RS = `关于参照执行《${S}》的通知`;
const AR = '档案管理办法（试行）';
// Two group policies of the other two major classes (brightrule#54): a
// level-1 governance rule and a 党工纪 policy, so the seed covers all three
// classes and all three levels.
const BR = '董事会议事规则';
const PI = '党风廉政建设责任制实施办法';

// ── 业务单元 ────────────────────────────────────────────────────────────────
// The units a policy belongs to (`owning_unit`, a lookup to the platform's
// sys_business_unit): the group, whose 集团机关 issues the group policies, and
// two subsidiaries under it. Names and codes are synthetic. The object is the
// platform's, so the seed names it with the fields it writes rather than
// importing its definition.
const GROUP = '示例集团';
const UNIT_A = '示例甲公司';
const UNIT_B = '示例乙公司';
const BusinessUnit = {
  name: 'sys_business_unit',
  fields: { name: {}, code: {}, kind: {}, parent_business_unit_id: {} },
} as const;
const businessUnits = defineSeed(BusinessUnit, {
  env: ['dev', 'test'],
  externalId: 'code',
  records: [
    { name: GROUP, code: 'DEMO-GROUP', kind: 'company' },
    { name: UNIT_A, code: 'DEMO-A', kind: 'company', parent_business_unit_id: GROUP },
    { name: UNIT_B, code: 'DEMO-B', kind: 'company', parent_business_unit_id: GROUP },
  ],
});

type ArticleRow = [policy: string, no: string, title: string, content: string];

/**
 * The sample articles (条); each policy's body is assembled from its own. There
 * is no clause table (brightrule#19): the articles live in the body, indexed
 * by `article_index`.
 */
export const ARTICLES: ArticleRow[] = [
  [T, '第五条', '住宿标准', '一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元，其他城市不超过 400 元，超标部分由个人承担。'],
  [T, '第八条', '伙食补贴', '出差伙食补贴每人每天 100 元，按实际出差天数计算，不再另行报销餐费。'],
  [T, '第十一条', '网约车报销', '出差期间市内交通可乘坐网约车，凭电子发票及行程单报销，单日不超过 150 元。'],
  [L, '第十二条', '年休假天数', '员工累计工作满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，年休假 10 天；满 20 年的，年休假 15 天。'],
  [L, '第十五条', '病假', '病假须提供二级以上医院诊断证明；连续病假 3 天以内由部门负责人审批，3 天以上须部门负责人及人力资源部审批。'],
  [S, '第六条', '口令要求', '系统口令长度不少于 12 位，须包含大小写字母、数字及特殊字符，每 90 天更换一次。'],
  [S, '第九条', '外部 AI 工具', '禁止将内部及以上密级数据上传至未经信息技术部批准的外部网盘、翻译或 AI 工具。'],
  [G, '第七条', '礼品收受', '员工不得收受价值超过 200 元的礼品；无法拒绝的，须在 3 个工作日内上交合规部登记。'],
  [C, '第十五条', '法务审查', '合同金额 50 万元以上，或违约金超过合同金额 20% 的，须经法务部审查后方可签署。'],
  [FC, '第一条', '执行要求', '本单位签订的合同按集团《合同管理办法》执行；需法务审查的合同，由本单位综合办公室初审后报集团法务部。'],
  [RS, '第一条', '参照范围', '本单位信息系统账号、数据分级与外部工具使用参照集团《信息安全管理规定》执行；本单位信息安全联络人由综合部指定。'],
  [BR, '第九条', '会议通知', '董事会定期会议应于会议召开 10 日前书面通知全体董事；临时会议应于会议召开 3 日前通知。'],
  [PI, '第六条', '廉政谈话', '各部门负责人每年至少与本部门员工开展一次廉政谈话，谈话记录报纪检监察室备案。'],
  [AR, '第六条', '借阅登记', '借阅档案须填写借阅登记表，经部门负责人同意后借阅，借阅期限不超过 15 个工作日。'],
];

/** 试行: the title says 「试行」 or 「暂行」 — what src/qa/policy-trial.hook.ts derives on save. */
const isTrial = (title: string) => /试行|暂行/.test(title);

/**
 * 制度大类: the major class of a 小类 — what src/qa/policy-category-group.hook.ts
 * derives on save.
 */
const categoryGroup = (category: string) =>
  category === 'governance' ? 'governance' : category === 'party' ? 'party' : 'operations';

/** What every group policy's issuing notice says: issued by the group, sent to every unit. */
const GROUP_ISSUE = { owning_unit: GROUP, issuance_type: 'issue', addressees: '集团机关各部室、各下属企业' };

/**
 * The sample policies' own fields — the 制度信息表 and issuing notice of each,
 * invented. Every one is published; the related-documents text names one
 * library policy and one outside the library (a name only), as an imported
 * info table does. The seven group policies come first; the subsidiaries'
 * forward and follow two of them (`parent_policy`, brightrule#48).
 */
const POLICY_ROWS = [
  { title: T, ...GROUP_ISSUE, issued_date: '2026-06-20',  policy_no: 'FIN-001', doc_no: '示例集团财字〔2026〕3号', issuing_unit: '集团', category: 'finance', policy_level: 'level_2', department: '财务部', co_departments: '人力资源部', review_body: '总经理办公会', decision_body: '总经理办公会', related_documents: `《费用报销管理规定》、《${L}》`, status: 'published', effective_date: '2026-07-01', next_review_date: '2027-06-30', summary: '国内出差的住宿、交通、补贴标准与报销要求。' },
  { title: L, ...GROUP_ISSUE, issued_date: '2026-02-20',  policy_no: 'HR-002', doc_no: '示例集团人字〔2026〕1号', issuing_unit: '集团', category: 'hr', policy_level: 'level_2', department: '人力资源部', status: 'published', effective_date: '2026-03-01', next_review_date: '2027-02-28', summary: '工作时间、请假类型、年休假与审批权限。' },
  { title: S, ...GROUP_ISSUE, issued_date: '2026-05-08',  policy_no: 'IT-003', doc_no: '示例集团信字〔2026〕2号', issuing_unit: '集团', category: 'it', policy_level: 'level_3', department: '信息技术部', status: 'published', effective_date: '2026-05-15', next_review_date: '2026-12-15', summary: '账号口令、数据分级与外部工具使用要求。' },
  { title: G, ...GROUP_ISSUE, issued_date: '2026-03-25',  policy_no: 'CMP-004', doc_no: '示例集团合字〔2026〕4号', issuing_unit: '集团', category: 'compliance', policy_level: 'level_2', department: '合规部', review_body: '党委会', decision_body: '董事会', status: 'published', effective_date: '2026-04-01', next_review_date: '2027-03-31', summary: '礼品礼金收受标准与利益冲突申报。' },
  { title: C, ...GROUP_ISSUE, issued_date: '2026-05-26',  policy_no: 'CMP-005', doc_no: '示例集团法字〔2026〕5号', issuing_unit: '集团', category: 'compliance', policy_level: 'level_3', department: '法务部', related_documents: `《${G}》`, status: 'published', effective_date: '2026-06-01', next_review_date: '2027-05-31', summary: '合同起草、审查、签署与归档。' },
  { title: BR, ...GROUP_ISSUE, issued_date: '2026-01-10',  policy_no: 'GOV-006', doc_no: '示例集团办字〔2026〕1号', issuing_unit: '集团', category: 'governance', policy_level: 'level_1', department: '董事会办公室', review_body: '党委会', decision_body: '董事会', status: 'published', effective_date: '2026-01-15', next_review_date: '2027-01-14', summary: '董事会会议的召集、通知、表决与记录。' },
  { title: PI, ...GROUP_ISSUE, issued_date: '2026-04-08',  policy_no: 'PTY-007', doc_no: '示例集团纪字〔2026〕2号', issuing_unit: '集团', category: 'party', policy_level: 'level_3', department: '纪检监察室', decision_body: '党委会', status: 'published', effective_date: '2026-04-15', next_review_date: '2027-04-14', summary: '党风廉政建设的责任分工、廉政谈话与考核。' },
  { title: FC, policy_no: 'A-LAW-001', doc_no: '示例甲司办字〔2026〕7号', issuing_unit: '示例甲公司', owning_unit: UNIT_A, issuance_type: 'forward', parent_policy: C, addressees: '本单位各部门、各项目部', category: 'compliance', policy_level: 'level_3', department: '综合办公室', status: 'published', issued_date: '2026-06-10', effective_date: '2026-06-10', next_review_date: '2027-06-09', summary: '转发集团合同管理办法，明确本单位的合同初审部门。' },
  { title: RS, policy_no: 'B-IT-001', doc_no: '示例乙司综字〔2026〕4号', issuing_unit: '示例乙公司', owning_unit: UNIT_B, issuance_type: 'reference', parent_policy: S, addressees: '本单位各部门', category: 'it', policy_level: 'level_3', department: '综合部', status: 'published', issued_date: '2026-06-01', effective_date: '2026-06-01', next_review_date: '2026-12-31', summary: '参照执行集团信息安全管理规定，指定本单位信息安全联络人。' },
  { title: AR, policy_no: 'B-ADM-002', doc_no: '示例乙司综字〔2026〕9号', issuing_unit: '示例乙公司', owning_unit: UNIT_B, issuance_type: 'issue', addressees: '本单位各部门', category: 'admin', policy_level: 'level_3', department: '综合部', status: 'published', issued_date: '2026-08-15', effective_date: '2026-09-01', next_review_date: '2027-08-31', summary: '档案的归档、保管与借阅；试行一年。' },
];

/** A policy row with its body: Markdown, article index and sizes (its original is seeded apart, below). */
const withBody = (p: (typeof POLICY_ROWS)[number]) => {
  const { markdown, articleIndex } = assembleBody(
    p.title,
    ARTICLES.filter(([policy]) => policy === p.title).map(([, no, title, text]) => ({ no, title, text })),
  );
  const { text_chars, text_tokens } = textStats(markdown);
  return { ...p, is_trial: isTrial(p.title), category_group: categoryGroup(p.category), body_md: markdown, article_index: articleIndex, text_chars, text_tokens, has_images: false };
};

const policies = defineSeed(Policy, {
  env: ['dev', 'test'],
  externalId: 'title',
  records: POLICY_ROWS.map(withBody),
});

// ── 原件与附件 ──────────────────────────────────────────────────────────────
// Every body and attachment carries an original file. This repository is
// public and ships no real policy and no docx / PDF (brightrule#4), so each
// original is a SYNTHETIC plain-text placeholder under fixtures/originals/,
// marked 合成示例 in its first line, written into the file field with
// `seedFile` (the build bundles the bytes). `content_hash` is the SHA-256 of
// those bytes; seed-documents.test.ts checks every hash against its file.

/** An original placeholder: package-relative path, download name, SHA-256 of its bytes. */
const original = (path: string, name: string, sha256: string) => ({
  original_file: seedFile(path, { name }),
  content_hash: sha256,
});

/** SHA-256 of each placeholder in fixtures/originals/, by file name. */
const ORIGINAL_SHA256: Record<string, string> = {
  'travel-body.txt': '604cb2b2e3c6400c8585eed6d8253e7fea0a6d2bcfa2040b208753c73f91c54b',
  'travel-attachment-1.txt': '9875310d7acafc436892cda080b85ca9b33cfc07499e9b6b8fc6957cd51cfc96',
  'travel-attachment-2.txt': 'b8288933673d9d435309ca3504b96eba77a43f56ada6817945d5730f6da8f909',
  'leave-body.txt': 'c0a5e4b165f0343d81ff854105a82156350a90163d62348c96e15529c916bd5a',
  'security-body.txt': '49682f1344b629088a02524ddf7eeebb9c0298017441f45ccd2aed4104a26d6e',
  'gifts-body.txt': '980181cfe3c2c5e82379258fa343d50cc96dbedcb78bd310537d1163ff635343',
  'contract-body.txt': '15f3e4dcac9ef3b0eebd0b82eda5c57c71229fa32b0ee6e1a67547d91ee6c3bf',
  'a-contract-forward-body.txt': '775913dfbec40968c91b78f7d687bb29ca31187d1660687308c580b6079774bd',
  'b-security-reference-body.txt': '4f4c4ab0937a95a5bbb1a7360f15da9a21f752c2a2978c7908529cf3dbf5a988',
  'b-archives-body.txt': '05b7ded8c4cd1147d1f0d7bb23eb277724bcc0f50eac0020be4b2b6a0dae9627',
  'board-rules-body.txt': 'd2e3cf5636d03b4f0ed07ea581877d4a857b89de16d344877a196acb94f598f8',
  'integrity-body.txt': '33808722d83a81bd88eff8d35197fb351f5b3f6ae3fc7c9c84a663681c325035',
};

/** The file-name stem of each sample policy's placeholders. */
const FILE_STEM: Record<string, string> = {
  [T]: 'travel',
  [L]: 'leave',
  [S]: 'security',
  [G]: 'gifts',
  [C]: 'contract',
  [FC]: 'a-contract-forward',
  [RS]: 'b-security-reference',
  [AR]: 'b-archives',
  [BR]: 'board-rules',
  [PI]: 'integrity',
};

const originalOf = (file: string, name: string) =>
  original(`fixtures/originals/${file}`, name, ORIGINAL_SHA256[file]);

// The body originals, as a dataset of their own that only fills two columns of
// the policies above. A seed file exists only in a built package: a load from
// source (vitest's stack) refuses the dataset that names one, and a policy row
// that carried its file would take every attachment down with it.
const policyOriginals = defineSeed(Policy, {
  env: ['dev', 'test'],
  externalId: 'title',
  mode: 'update',
  records: POLICY_ROWS.map((p) => ({
    title: p.title,
    ...originalOf(`${FILE_STEM[p.title]}-body.txt`, `${p.title}（合成示例原件）.txt`),
  })),
});

/** 附件 1 — a table that is part of the rule, so the AI reads it with the body. */
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

// An attachment's title is its own name, so it is unique only within its
// policy: the seed key is the policy and the number.
const attachments = defineSeed(PolicyAttachment, {
  env: ['dev', 'test'],
  externalId: ['policy', 'sort_no'],
  records: [
    {
      title: '住宿标准表',
      label: '附件1',
      policy: T,
      sort_no: 1,
      body_md: LODGING_TABLE,
      ...textStats(LODGING_TABLE),
      has_images: false,
      ...originalOf('travel-attachment-1.txt', `${T} 附件1 住宿标准表（合成示例原件）.txt`),
    },
    {
      // A form people fill in: only the original, no text for the AI; its
      // signature area is a picture a person has yet to look at.
      title: '出差审批单',
      label: '附件2',
      policy: T,
      sort_no: 2,
      ...textStats(undefined),
      has_images: true,
      images_need_review: true,
      ...originalOf('travel-attachment-2.txt', `${T} 附件2 出差审批单（合成示例原件）.txt`),
    },
  ],
});

// ── 制度意见 ───────────────────────────────────────────────────────────────
// Two opinions on the travel policy, as a diagnosis run would file them
// (brightrule#48, #57). 大类 is written out; the intake hook derives the same. Written by hand — the 「AI 诊断」 action does not diagnose
// yet — and marked so in `run_info`. The quotes are the seeded article text.
const DIAGNOSIS_BATCH = 'seed-20261126';
const suggestions = defineSeed(PolicySuggestion, {
  env: ['dev', 'test'],
  externalId: ['policy', 'article'],
  records: [
    {
      policy: T,
      source: 'ai_diagnosis',
      category_group: 'defect',
      category: 'ambiguity',
      severity: 'medium',
      article: '第十一条',
      quote: ARTICLES.find(([p, no]) => p === T && no === '第十一条')![3],
      finding: '「单日不超过 150 元」没有说明是否包含往返机场、火车站的网约车费用，报销时容易各自理解。',
      suggestion: '写明上限是否包含往返机场、火车站的费用；不包含的，单列标准或写明按实报销。',
      status: 'open',
      batch_id: DIAGNOSIS_BATCH,
      diagnosed_at: '2026-11-26T09:00:00.000Z',
      run_info: { source: 'seed', note: '合成示例，非 AI 生成' },
    },
    {
      policy: T,
      source: 'ai_diagnosis',
      category_group: 'defect',
      category: 'cross_policy_conflict',
      severity: 'low',
      article: '第八条',
      quote: ARTICLES.find(([p, no]) => p === T && no === '第八条')![3],
      finding: '「按实际出差天数计算」没有说明出发、返回当天是否计入；出差天数的口径应与《考勤与休假管理制度》的考勤记录一致。',
      suggestion: '写明出发、返回当天的计算方法，并注明以考勤记录的出差天数为准。',
      related_policy: L,
      status: 'discussing',
      batch_id: DIAGNOSIS_BATCH,
      diagnosed_at: '2026-11-26T09:00:00.000Z',
      run_info: { source: 'seed', note: '合成示例，非 AI 生成' },
    },
  ],
});

export const BrightRuleSeedData = [businessUnits, policies, policyOriginals, attachments, suggestions];
