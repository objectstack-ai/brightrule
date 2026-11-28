/**
 * Distractor policies (brightrule#69 §1, absorbs brightrule#8): 1,000–2,000
 * policies owned by forty invented companies that no persona belongs to.
 * They crowd the catalog for the scale test and, because every one has a
 * body, they are real competition for a retriever too — above all the ones
 * that share a core policy's title (同名不同单位) with other numbers.
 *
 * Generated, never written into the repository: the same seed gives the same
 * corpus byte for byte (a test pins its hash).
 */
import type { CorpusPolicy, Unit } from '../schema.js';
import { buildPolicy, type Fact } from './build-policy.js';
import {
  allowanceFacts, assetsFacts, disciplineFacts, hospitalityFacts, leaveFacts, loanFacts, meetingFacts,
  procurementFacts, remoteFacts, safetyFacts, trainingFacts, travelFacts, vehicleFacts,
} from './families-zh.js';
import { DISTRACTOR_UNITS } from './units.js';

export const DEFAULT_DISTRACTORS = 1500;
export const DISTRACTOR_SEED = 20261128;

/** mulberry32: a small deterministic PRNG. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const step = (r: Rng, lo: number, hi: number, by: number) => int(r, lo / by, hi / by) * by;
const pick = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

interface Topic {
  title: string;
  category: string;
  dept: string;
  facts: (r: Rng) => Fact[];
}

/** Same-title families: the core corpus has policies of these names. */
const FAMILY_TOPICS: Topic[] = [
  { title: '差旅费报销管理办法', category: 'finance', dept: '财务部', facts: (r) => travelFacts({ longTripDays: int(r, 5, 10), lodging: r() < 0.3 ? { staff: [step(r, 380, 520, 10), step(r, 260, 360, 10)], manager: [step(r, 500, 650, 10), step(r, 350, 450, 10)], executive: [step(r, 700, 900, 50), step(r, 450, 600, 50)] } : { first: step(r, 420, 680, 10), other: step(r, 280, 420, 10) }, meal: step(r, 60, 120, 10), taxi: step(r, 80, 200, 10), deadlineDays: pick(r, [10, 15, 20, 30]), premiumFrom: pick(r, ['中层管理人员', '高级管理人员'] as const) }) },
  { title: '考勤与休假管理制度', category: 'hr', dept: '人力资源部', facts: (r) => leaveFacts({ annual: [int(r, 5, 8), int(r, 9, 12), int(r, 13, 16)], sickApproveDays: int(r, 2, 5), marriage: pick(r, [3, 10, 13, 15]), bereavement: int(r, 1, 5), carryOverMonths: pick(r, [1, 3, 6]) }) },
  { title: '员工培训管理办法', category: 'hr', dept: '人力资源部', facts: (r) => trainingFacts({ threshold: step(r, 2000, 10000, 1000), yearsPer10k: int(r, 1, 3), trainerFee: step(r, 150, 500, 50), externalApprover: pick(r, ['人力资源部', '分管领导']) }) },
  { title: '通讯费补贴管理办法', category: 'hr', dept: '人力资源部', facts: (r) => allowanceFacts({ staff: step(r, 50, 200, 10), manager: step(r, 200, 400, 10), executive: step(r, 400, 800, 50), payDay: pick(r, [5, 10, 15, 20]) }) },
  { title: '公务用车管理办法', category: 'admin', dept: '办公室', facts: (r) => vehicleFacts({ perKm: pick(r, [0.8, 0.9, 1.0, 1.1, 1.3, 1.5]), approvalKm: step(r, 100, 500, 50), fuelCard: step(r, 1000, 3000, 100) }) },
  { title: '会议费管理办法', category: 'finance', dept: '财务部', facts: (r) => meetingFacts({ rates: [step(r, 650, 850, 10), step(r, 550, 650, 10), step(r, 400, 550, 10)], days: [int(r, 2, 4), int(r, 1, 3), int(r, 1, 2)] }) },
  { title: '业务招待费管理办法', category: 'finance', dept: '财务部', facts: (r) => hospitalityFacts({ perPerson: step(r, 120, 400, 10), accompanyRatio: pick(r, ['二分之一', '三分之二', '三分之一']), approveAbove: step(r, 2000, 10000, 1000) }) },
  { title: '采购管理办法', category: 'operations', dept: '采购部', facts: (r) => { const tender = pick(r, [5, 10, 20, 30, 50]); return procurementFacts({ tender, compare: Math.max(1, Math.round(tender / pick(r, [2, 4, 5]))) }); } },
  { title: '远程办公管理办法（试行）', category: 'hr', dept: '人力资源部', facts: (r) => remoteFacts({ quota: pick(r, ['每月远程办公不超过 2 个工作日', '每月远程办公不超过 6 个工作日', '每周远程办公不超过 1 个工作日', '每周远程办公不超过 3 个工作日']), noticeDays: int(r, 1, 3) }) },
  { title: '安全生产管理规定', category: 'safety', dept: '安全环保部', facts: (r) => safetyFacts({ reportMinutes: pick(r, [15, 30, 45, 60, 120]), trainingHours: pick(r, [16, 20, 24, 32, 40]), heightMeters: pick(r, [2, 3]) }) },
  { title: '固定资产管理办法', category: 'asset', dept: '资产管理部', facts: (r) => assetsFacts({ threshold: pick(r, [1000, 2000, 3000, 5000, 10000]), scrapAbove: pick(r, [5, 10, 20, 50]) }) },
  { title: '员工奖惩管理办法', category: 'hr', dept: '人力资源部', facts: (r) => disciplineFacts({ absentDays: int(r, 2, 5), absentYearDays: int(r, 7, 15), demeritCut: step(r, 20, 80, 10), commendation: step(r, 500, 5000, 500) }) },
  { title: '借款与备用金管理办法', category: 'finance', dept: '财务部', facts: (r) => loanFacts({ repayDays: pick(r, [5, 10, 15, 20]), overdueDays: pick(r, [30, 60, 90]), cfoAbove: pick(r, [1, 2, 5, 10]), pettyCash: step(r, 2000, 20000, 1000) }) },
];

/** Topics no core policy has: they only crowd the catalog. */
const GENERIC_TOPICS: Array<[title: string, category: string, dept: string]> = [
  ['食堂管理办法', 'admin', '办公室'], ['办公用品管理办法', 'admin', '办公室'], ['车辆维修保养管理规定', 'admin', '办公室'],
  ['绿化与环境卫生管理规定', 'admin', '办公室'], ['消防安全管理规定', 'safety', '安全环保部'], ['危险化学品管理办法', 'safety', '安全环保部'],
  ['环境保护管理办法', 'safety', '安全环保部'], ['职业健康管理规定', 'safety', '安全环保部'], ['应急管理办法', 'safety', '安全环保部'],
  ['工程项目管理办法', 'tech', '工程管理部'], ['工程质量管理规定', 'tech', '工程管理部'], ['科技创新奖励办法', 'tech', '科技部'],
  ['知识产权管理办法', 'tech', '科技部'], ['信息化项目管理办法', 'it', '信息中心'], ['网络安全事件应急预案', 'it', '信息中心'],
  ['数据分类分级管理办法', 'it', '信息中心'], ['软件正版化管理规定', 'it', '信息中心'], ['投资管理办法', 'strategy', '投资部'],
  ['股权管理办法', 'strategy', '投资部'], ['战略规划管理办法', 'strategy', '战略部'], ['全面预算管理办法', 'finance', '财务部'],
  ['资金管理办法', 'finance', '财务部'], ['税务管理办法', 'finance', '财务部'], ['财务报告管理办法', 'finance', '财务部'],
  ['担保管理办法', 'finance', '财务部'], ['招聘管理办法', 'hr', '人力资源部'], ['绩效考核管理办法', 'hr', '人力资源部'],
  ['劳动合同管理办法', 'hr', '人力资源部'], ['员工离职管理办法', 'hr', '人力资源部'], ['岗位管理办法', 'hr', '人力资源部'],
  ['人事档案管理办法', 'hr', '人力资源部'], ['风险管理办法', 'compliance', '风控部'], ['内部控制管理办法', 'compliance', '风控部'],
  ['法律纠纷案件管理办法', 'compliance', '法务部'], ['合规管理办法', 'compliance', '合规部'], ['供应商管理办法', 'operations', '采购部'],
  ['仓储管理办法', 'operations', '物资部'], ['客户服务管理规定', 'operations', '市场部'], ['品牌宣传管理办法', 'admin', '党群工作部'],
  ['新闻发布管理办法', 'admin', '党群工作部'], ['公文处理办法', 'admin', '办公室'], ['督办工作管理办法', 'admin', '办公室'],
  ['党委会议事规则', 'party', '党委办公室'], ['党支部工作细则', 'party', '党委办公室'], ['纪检监察工作规定', 'party', '纪检监察室'],
  ['总经理办公会议事规则', 'governance', '办公室'], ['监事会议事规则', 'governance', '办公室'], ['授权管理办法', 'governance', '办公室'],
];

const genericFacts = (topic: string, dept: string) => (r: Rng): Fact[] => [
  ['duty', '职责分工', `${dept}负责${topic}工作的统筹管理，各部门指定 1 名${topic}联络人，负责本部门的日常工作。`],
  ['approval', '审批权限', `${topic}事项涉及金额在 ${step(r, 1, 50, 1)} 万元以上的，须经分管领导审批；涉及金额在 ${step(r, 60, 300, 10)} 万元以上的，须报总经理办公会审议。`],
  ['record', '记录保存', `${topic}相关记录保存期限不少于 ${pick(r, [3, 5, 10])} 年，${dept}每 ${pick(r, [3, 6, 12])} 个月组织一次检查。`],
  ['penalty', '责任追究', `违反本办法规定造成损失的，视情节扣发责任人当月绩效工资的 ${step(r, 10, 30, 10)}% 至 ${step(r, 40, 100, 10)}%。`],
];

const TOPICS: Topic[] = [
  ...FAMILY_TOPICS,
  ...GENERIC_TOPICS.map(([title, category, dept]) => ({
    title, category, dept, facts: genericFacts(title.replace(/（.*?）/g, '').replace(/(管理)?(办法|规定|规则|细则|预案)$/, ''), dept),
  })),
];

export function distractorUnits(): Unit[] {
  return DISTRACTOR_UNITS;
}

/** `count` distractor policies, the same for the same seed. */
export function distractors(count = DEFAULT_DISTRACTORS, seed = DISTRACTOR_SEED): CorpusPolicy[] {
  if (count > DISTRACTOR_UNITS.length * TOPICS.length) throw new Error(`at most ${DISTRACTOR_UNITS.length * TOPICS.length} distractors`);
  const r = prng(seed);
  const perUnit = Math.ceil(count / DISTRACTOR_UNITS.length);
  const out: CorpusPolicy[] = [];
  for (const [u, unit] of DISTRACTOR_UNITS.entries()) {
    // A shuffled topic order per unit: each unit holds at most one policy of a title.
    const order = TOPICS.map((t, i) => ({ t, i, k: r() })).sort((x, y) => x.k - y.k);
    for (const { t, i } of order.slice(0, perUnit)) {
      if (out.length >= count) break;
      const roll = r();
      const status = roll < 0.08 ? 'abolished' : roll < 0.15 ? 'draft' : 'published';
      const year = pick(r, [2024, 2025, 2026]);
      const month = int(r, 1, 12);
      const day = int(r, 1, 28);
      const issued = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const nn = String(u + 1).padStart(2, '0');
      const stem = unit.name.replace(/^示例|公司$/g, '');
      const built = buildPolicy({
        key: `D${nn}-T${String(i + 1).padStart(2, '0')}`,
        title: t.title,
        unit: unit.code,
        unitName: unit.name,
        status,
        category: t.category,
        level: pick(r, ['level_2', 'level_3'] as const),
        dept: t.dept,
        ...(status === 'draft' ? {} : { docNo: `示例${stem}字〔${year}〕${int(r, 1, 40)}号` }),
        issued,
        effective: issued,
        addressees: '本单位各部门',
        facts: t.facts(r),
        origin: 'distractor',
      });
      out.push(built.policy);
    }
  }
  return out;
}
