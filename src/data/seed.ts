import { defineSeed } from '@objectstack/spec/data';
import { Policy } from '../objects/policy.object.js';
import { PolicyVersion } from '../objects/policy-version.object.js';
import { Clause } from '../objects/clause.object.js';

// Sample policies. Lookups name their parent by its seed key (`title`).
// No inquiries are seeded: an inquiry is answered when it is saved, so the
// demo asks its questions against the running app.

const T = '差旅费报销管理办法';
const L = '考勤与休假管理制度';
const S = '信息安全管理规定';
const G = '反商业贿赂与利益冲突管理规定';
const C = '合同管理办法';

const policies = defineSeed(Policy, {
  externalId: 'title',
  records: [
    { title: T, policy_no: 'FIN-001', issuing_unit: '集团', category: 'finance', department: '财务部', status: 'published', current_version: 'V3.0', effective_date: '2026-07-01', next_review_date: '2027-06-30', summary: '国内出差的住宿、交通、补贴标准与报销要求。' },
    { title: L, policy_no: 'HR-002', issuing_unit: '集团', category: 'hr', department: '人力资源部', status: 'published', current_version: 'V2.1', effective_date: '2026-03-01', next_review_date: '2027-02-28', summary: '工作时间、请假类型、年休假与审批权限。' },
    { title: S, policy_no: 'IT-003', issuing_unit: '集团', category: 'it', department: '信息技术部', status: 'published', current_version: 'V1.2', effective_date: '2026-05-15', next_review_date: '2026-12-15', summary: '账号口令、数据分级与外部工具使用要求。' },
    { title: G, policy_no: 'CMP-004', issuing_unit: '集团', category: 'compliance', department: '合规部', status: 'published', current_version: 'V1.1', effective_date: '2026-04-01', next_review_date: '2027-03-31', summary: '礼品礼金收受标准与利益冲突申报。' },
    { title: C, policy_no: 'CMP-005', issuing_unit: '集团', category: 'compliance', department: '法务部', status: 'published', current_version: 'V2.0', effective_date: '2026-06-01', next_review_date: '2027-05-31', summary: '合同起草、审查、签署与归档。' },
  ],
});

const versions = defineSeed(PolicyVersion, {
  externalId: 'title',
  records: [
    { title: `${T} V2.0`, policy: T, version_no: 'V2.0', version_status: 'superseded', effective_date: '2024-07-01', change_note: '旧版本，已被 V3.0 替代。' },
    { title: `${T} V3.0`, policy: T, version_no: 'V3.0', version_status: 'current', effective_date: '2026-07-01', change_note: '上调一线城市住宿标准，新增网约车报销规定。' },
    { title: `${L} V2.1`, policy: L, version_no: 'V2.1', version_status: 'current', effective_date: '2026-03-01', change_note: '明确年休假天数与病假审批。' },
    { title: `${S} V1.2`, policy: S, version_no: 'V1.2', version_status: 'current', effective_date: '2026-05-15', change_note: '新增外部 AI 工具使用条款。' },
    { title: `${G} V1.1`, policy: G, version_no: 'V1.1', version_status: 'current', effective_date: '2026-04-01', change_note: '明确礼品价值上限。' },
    { title: `${C} V2.0`, policy: C, version_no: 'V2.0', version_status: 'current', effective_date: '2026-06-01', change_note: '调整法务审查门槛。' },
  ],
});

const clause = (
  policy: string, version: string, no: string, title: string, content: string, keywords: string, isCurrent: boolean,
) => ({
  title: `${policy} ${version} ${no} ${title}`,
  policy,
  policy_version: `${policy} ${version}`,
  citation: `《${policy}》${version} ${no}`,
  content,
  keywords,
  is_current: isCurrent,
});

const clauses = defineSeed(Clause, {
  externalId: 'title',
  records: [
    clause(T, 'V2.0', '第五条', '住宿标准', '一线城市住宿标准为每晚不超过 500 元，其他城市不超过 350 元。', '住宿 酒店 标准', false),
    clause(T, 'V3.0', '第五条', '住宿标准', '一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 600 元，其他城市不超过 400 元，超标部分由个人承担。', '住宿 酒店 标准 出差', true),
    clause(T, 'V3.0', '第八条', '伙食补贴', '出差伙食补贴每人每天 100 元，按实际出差天数计算，不再另行报销餐费。', '补贴 餐费 伙食', true),
    clause(T, 'V3.0', '第十一条', '网约车报销', '出差期间市内交通可乘坐网约车，凭电子发票及行程单报销，单日不超过 150 元。', '网约车 打车 交通 报销', true),
    clause(L, 'V2.1', '第十二条', '年休假天数', '员工累计工作满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，年休假 10 天；满 20 年的，年休假 15 天。', '年假 年休假 休假', true),
    clause(L, 'V2.1', '第十五条', '病假', '病假须提供二级以上医院诊断证明；连续病假 3 天以内由部门负责人审批，3 天以上须部门负责人及人力资源部审批。', '病假 请假 审批', true),
    clause(S, 'V1.2', '第六条', '口令要求', '系统口令长度不少于 12 位，须包含大小写字母、数字及特殊字符，每 90 天更换一次。', '密码 口令', true),
    clause(S, 'V1.2', '第九条', '外部 AI 工具', '禁止将内部及以上密级数据上传至未经信息技术部批准的外部网盘、翻译或 AI 工具。', 'AI 工具 数据外发 网盘 翻译', true),
    clause(G, 'V1.1', '第七条', '礼品收受', '员工不得收受价值超过 200 元的礼品；无法拒绝的，须在 3 个工作日内上交合规部登记。', '礼品 礼金 收礼', true),
    clause(C, 'V2.0', '第十五条', '法务审查', '合同金额 50 万元以上，或违约金超过合同金额 20% 的，须经法务部审查后方可签署。', '合同 法务 审查 签署', true),
  ],
});

export const BrightRuleSeedData = [policies, versions, clauses];
