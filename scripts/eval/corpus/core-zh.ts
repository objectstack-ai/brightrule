/**
 * The hand-written Chinese core of the evaluation corpus: the app's ten dev
 * seed policies (read from src/data/seed.ts, so they never drift) plus the
 * policies written here. Every policy and number is invented.
 *
 * What the core covers (brightrule#69 §1): the group and three subsidiaries
 * (and one branch under 甲公司); 同名不同标准 (the same title with different
 * numbers per unit); 转发 / 参照执行; 试行; 已废止 and 草稿 versions whose
 * numbers must not be used; 限定范围 policies; tiers by rank; attachments;
 * cross-references; deliberate conflicts between two group policies.
 */
import { BrightRuleSeedData } from '../../../src/data/seed.js';
import type { ArticleIndexEntry } from '../../../src/data/document-text.js';
import type { CorpusPolicy } from '../schema.js';
import { buildPolicy, categoryGroup, type BuiltPolicy, type PolicyDef } from './build-policy.js';
import {
  allowanceFacts, assetsFacts, DEPRECIATION_TABLE, disciplineFacts, hospitalityFacts, leaveFacts, loanFacts,
  meetingFacts, overtimeFacts, probationFacts, procurementFacts, remoteFacts, safetyFacts, trainingFacts,
  travelFacts, vehicleFacts,
} from './families-zh.js';
import { A, AE, B, C, G, UNIT_NAME } from './units.js';

type Row = Record<string, unknown>;

// ── The dev seed's ten policies ─────────────────────────────────────────────

const UNIT_BY_NAME = Object.fromEntries(Object.entries(UNIT_NAME).map(([code, name]) => [name, code]));
const seedRows = (object: string) =>
  (BrightRuleSeedData.find((s) => s.object === object)?.records ?? []) as Row[];

function seedPolicies(): BuiltPolicy[] {
  const attachments = seedRows('brightrule_policy_attachment');
  const policies = seedRows('brightrule_policy');
  const keyByTitle = Object.fromEntries(policies.map((p) => [p.title, p.policy_no]));
  return policies.map((p) => {
    const index = p.article_index as ArticleIndexEntry[];
    const policy: CorpusPolicy = {
      key: String(p.policy_no),
      title: String(p.title),
      unit: UNIT_BY_NAME[String(p.owning_unit)],
      lang: 'zh',
      status: p.status as CorpusPolicy['status'],
      issuance_type: (p.issuance_type as CorpusPolicy['issuance_type']) ?? 'issue',
      ...(p.parent_policy ? { parent: String(keyByTitle[String(p.parent_policy)]) } : {}),
      doc_no: String(p.doc_no),
      issuing_unit: String(p.issuing_unit),
      category: String(p.category),
      category_group: categoryGroup(String(p.category)),
      ...(p.policy_level ? { policy_level: p.policy_level as CorpusPolicy['policy_level'] } : {}),
      department: String(p.department),
      addressees: String(p.addressees),
      issued_date: String(p.issued_date),
      effective_date: String(p.effective_date),
      summary: String(p.summary),
      is_trial: Boolean(p.is_trial),
      body_md: String(p.body_md),
      article_index: index,
      attachments: attachments
        .filter((a) => a.policy === p.title)
        .map((a) => ({
          label: String(a.label),
          title: String(a.title),
          sort_no: Number(a.sort_no),
          ...(a.body_md ? { body_md: String(a.body_md) } : {}),
        })),
      origin: 'seed',
    };
    return { policy, articles: Object.fromEntries(index.map((e) => [e.article, e.article])) };
  });
}

// ── Written here ────────────────────────────────────────────────────────────

const gn = UNIT_NAME[G];
const an = UNIT_NAME[A];
const aen = UNIT_NAME[AE];
const bn = UNIT_NAME[B];
const cn = UNIT_NAME[C];
const GROUP_TO = '集团机关各部室、各下属企业';

const DEFS: PolicyDef[] = [
  // 差旅：集团是种子 FIN-001（600 / 400 / 100 / 150）；甲、丙各有一份同名不同标准；集团旧版已废止。
  {
    key: 'A-FIN-010', title: '差旅费报销管理办法', unit: A, unitName: an, category: 'finance', level: 'level_2', dept: '财务部',
    docNo: '示例甲司财字〔2026〕2号', issued: '2026-03-10', effective: '2026-04-01', addressees: '本单位各部门、各项目部',
    summary: '甲公司国内出差的住宿、交通、补贴标准与报销时限。',
    facts: travelFacts({ longTripDays: 7, lodging: { first: 500, other: 350 }, meal: 80, taxi: 120, deadlineDays: 15, premiumFrom: '高级管理人员' }),
  },
  {
    key: 'AE-FIN-001', title: '项目现场驻勤补贴补充规定', unit: AE, unitName: aen, category: 'finance', level: 'level_3', dept: '综合办公室',
    docNo: '示例甲华东办字〔2026〕3号', issued: '2026-05-06', effective: '2026-05-15', addressees: '分公司各项目部',
    summary: '华东分公司员工在项目现场驻勤的补贴，其余差旅事项按甲公司规定执行。',
    facts: [
      ['onsite', '驻勤补贴', '员工在项目现场连续驻勤 7 天以上的，除按甲公司差旅规定领取伙食补贴外，另发驻勤补贴每天 50 元。'],
      ['other', '其他事项', `本规定未作规定的差旅事项，按${an}《差旅费报销管理办法》执行。`],
    ],
  },
  {
    key: 'C-FIN-010', title: '差旅费报销管理办法', unit: C, unitName: cn, category: 'finance', level: 'level_2', dept: '财务部',
    docNo: '示例丙司财字〔2026〕5号', issued: '2026-02-18', effective: '2026-03-01', addressees: '本单位各部门',
    summary: '丙公司按职级分档的住宿标准、伙食与交通补贴。',
    facts: travelFacts({ longTripDays: 5, lodging: { staff: [450, 300], manager: [550, 380], executive: [800, 500] }, meal: 90, taxi: 100, deadlineDays: 20, premiumFrom: '中层管理人员' }),
  },
  {
    key: 'FIN-001-2023', title: '差旅费报销管理办法（2023年版）', unit: G, unitName: gn, status: 'abolished', category: 'finance', level: 'level_2', dept: '财务部',
    docNo: '示例集团财字〔2023〕6号', issued: '2023-03-01', effective: '2023-04-01', addressees: GROUP_TO,
    summary: '已被 2026 年版取代。',
    facts: travelFacts({ longTripDays: 10, lodging: { first: 480, other: 320 }, meal: 70, taxi: 90, deadlineDays: 30, premiumFrom: '高级管理人员' }),
  },

  // 考勤与休假：集团是种子 HR-002（年休假 5 / 10 / 15，病假 3 天）；乙公司有自己的，丙公司试行版和已废止旧版。
  {
    key: 'B-HR-002', title: '考勤与休假管理制度', unit: B, unitName: bn, category: 'hr', level: 'level_2', dept: '综合部',
    docNo: '示例乙司综字〔2026〕2号', issued: '2026-01-15', effective: '2026-02-01', addressees: '本单位各部门',
    summary: '乙公司的工时、年休假、病假、婚假和丧假。',
    facts: leaveFacts({ annual: [7, 12, 15], sickApproveDays: 2, marriage: 15, bereavement: 3, carryOverMonths: 3 }),
  },
  {
    key: 'C-HR-002', title: '考勤与休假管理制度（试行）', unit: C, unitName: cn, category: 'hr', level: 'level_2', dept: '人力资源部',
    docNo: '示例丙司人字〔2026〕1号', issued: '2026-06-01', effective: '2026-07-01', addressees: '本单位各部门',
    summary: '丙公司试行的考勤与休假规定，试行一年。', supersedes: '考勤与休假管理制度（2023年版）',
    facts: leaveFacts({ annual: [6, 11, 16], sickApproveDays: 3, marriage: 10, bereavement: 5, carryOverMonths: 6 }),
  },
  {
    key: 'C-HR-002-2023', title: '考勤与休假管理制度（2023年版）', unit: C, unitName: cn, status: 'abolished', category: 'hr', level: 'level_2', dept: '人力资源部',
    docNo: '示例丙司人字〔2023〕4号', issued: '2023-05-01', effective: '2023-06-01', addressees: '本单位各部门',
    facts: leaveFacts({ annual: [5, 8, 12], sickApproveDays: 5, marriage: 3, bereavement: 2, carryOverMonths: 1 }),
  },

  // 信息安全：集团种子 IT-003；乙公司参照执行（种子）；甲公司有自己的实施细则。保密规定与之冲突（外部翻译工具）。
  {
    key: 'A-IT-002', title: '信息安全管理实施细则', unit: A, unitName: an, category: 'it', level: 'level_3', dept: '信息中心',
    docNo: '示例甲司信字〔2026〕1号', issued: '2026-06-20', effective: '2026-07-01', addressees: '本单位各部门、各项目部',
    summary: '甲公司的口令、移动存储介质和安全事件报告要求。',
    facts: [
      ['password', '口令要求', '系统口令长度不少于 14 位，须包含大小写字母、数字及特殊字符，每 60 天更换一次，不得与前 5 次口令相同。'],
      ['usb', '移动存储介质', '办公电脑默认禁用 U 盘等移动存储介质；确因工作需要的，须经信息中心审批并使用公司配发的加密 U 盘。'],
      ['incident', '安全事件报告', '发现病毒感染、账号被盗或数据泄露的，应立即断开网络并在 2 小时内报告信息中心。'],
      ['other', '其他事项', `本细则未作规定的，按${gn}《信息安全管理规定》执行。`],
    ],
  },
  {
    key: 'G-ADM-020', title: '保密管理规定', unit: G, unitName: gn, category: 'admin', level: 'level_2', dept: '保密办公室',
    docNo: '示例集团办字〔2026〕8号', issued: '2026-07-10', effective: '2026-08-01', addressees: GROUP_TO,
    summary: '涉密文件、对外提供资料和外部工具使用的保密要求。',
    facts: [
      ['levels', '密级划分', '集团工作秘密分为核心、重要、内部三级，由文件起草部门在起草时标注。'],
      ['outbound', '对外提供资料', '向外单位提供标注密级的资料，须经部门负责人和保密办公室审批，并登记提供内容和接收单位。'],
      ['tools', '外部工具', '确因工作需要使用外部翻译、文字识别等在线工具处理内部级资料的，经部门负责人批准后可以使用；核心、重要级资料一律不得使用外部在线工具处理。'],
      ['meeting', '涉密会议', '召开涉密会议不得使用无线话筒，参会人员不得携带手机进入会场。'],
    ],
  },

  // 礼品：集团种子 CMP-004（200 元 / 3 个工作日）；丙公司有自己的。
  {
    key: 'C-CMP-004', title: '反商业贿赂与利益冲突管理规定', unit: C, unitName: cn, category: 'compliance', level: 'level_2', dept: '合规部',
    docNo: '示例丙司合字〔2026〕2号', issued: '2026-04-20', effective: '2026-05-01', addressees: '本单位各部门',
    summary: '丙公司礼品收受标准、上交时限和利益冲突申报。',
    facts: [
      ['gift', '礼品收受', '员工不得收受价值超过 300 元的礼品；无法拒绝的，须在 5 个工作日内上交合规部登记。'],
      ['cash', '礼金', '员工不得以任何形式收受礼金、购物卡和有价证券，无论金额大小。'],
      ['conflict', '利益冲突申报', '员工的近亲属在供应商、客户处任职或持股的，员工应在知悉后 10 个工作日内向合规部书面申报。'],
    ],
  },

  // 合同：集团种子 CMP-005（50 万 / 20%）；甲公司转发（种子）；丙公司有实施细则。
  {
    key: 'C-CMP-005', title: '合同管理实施细则', unit: C, unitName: cn, category: 'compliance', level: 'level_3', dept: '法务部',
    docNo: '示例丙司法字〔2026〕3号', issued: '2026-06-12', effective: '2026-07-01', addressees: '本单位各部门',
    summary: '丙公司合同的审批权限、法务审查和归档。',
    facts: [
      ['legal', '法务审查', '合同金额 100 万元以上的，须经法务部审查后方可签署；对方为境外主体的合同，不论金额均须法务审查。'],
      ['approval', '审批权限', '合同金额 30 万元以下由分管副总经理审批；30 万元以上的，由总经理审批。'],
      ['archive', '合同归档', '合同签署后 7 个工作日内，经办部门须将合同原件交档案室归档。'],
    ],
  },

  // 董事会：集团种子 GOV-006（10 日 / 3 日）；甲公司自己的。
  {
    key: 'A-GOV-001', title: '董事会议事规则', unit: A, unitName: an, category: 'governance', level: 'level_1', dept: '董事会办公室',
    docNo: '示例甲司董字〔2026〕1号', issued: '2026-02-01', effective: '2026-02-15', addressees: '公司董事、监事、高级管理人员',
    summary: '甲公司董事会会议的通知、出席和表决。',
    facts: [
      ['notice', '会议通知', '董事会定期会议应于会议召开 14 日前书面通知全体董事；临时会议应于会议召开 5 日前通知。'],
      ['quorum', '出席', '董事会会议应有过半数的董事出席方可举行。'],
      ['vote', '表决', '董事会作出决议，须经全体董事的过半数通过；对外担保事项须经出席会议的三分之二以上董事同意。'],
    ],
  },

  // 档案：乙公司试行（种子 B-ADM-002，借阅 15 个工作日）；集团自己的，带保管期限表附件。
  {
    key: 'G-ADM-008', title: '档案管理办法', unit: G, unitName: gn, category: 'admin', level: 'level_2', dept: '办公室',
    docNo: '示例集团办字〔2026〕4号', issued: '2026-03-15', effective: '2026-04-01', addressees: GROUP_TO,
    summary: '集团档案的归档、保管期限与借阅。',
    facts: [
      ['filing', '归档时间', '各部门应于次年 3 月底前将上一年度形成的文件材料整理归档。'],
      ['retention', '保管期限', '档案保管期限分为永久、30 年、10 年三种，具体按附件1《文书档案保管期限表》执行。'],
      ['borrow', '借阅', '借阅档案须填写借阅登记表，经档案管理部门同意后借阅，借阅期限不超过 10 个工作日；借阅永久保管档案的，还须经办公室主任批准。'],
    ],
    attachments: [
      {
        label: '附件1', title: '文书档案保管期限表', sort_no: 1,
        body_md: ['# 附件1 文书档案保管期限表', '', '| 文件材料 | 保管期限 |', '|---|---|', '| 董事会、党委会会议纪要 | 永久 |', '| 年度工作计划、总结 | 30 年 |', '| 一般业务往来函件 | 10 年 |', '| 合同协议 | 合同终止后 30 年 |', ''].join('\n'),
      },
    ],
  },

  // 培训：集团和甲公司各一份；乙公司转发集团的。
  {
    key: 'G-HR-010', title: '员工培训管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_2', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕3号', issued: '2026-04-01', effective: '2026-04-15', addressees: GROUP_TO,
    summary: '培训计划、外部培训审批、服务期和内训师课酬。',
    facts: trainingFacts({ threshold: 5000, yearsPer10k: 1, trainerFee: 300, externalApprover: '人力资源部' }),
  },
  {
    key: 'A-HR-010', title: '员工培训管理办法', unit: A, unitName: an, category: 'hr', level: 'level_2', dept: '综合办公室',
    docNo: '示例甲司人字〔2026〕2号', issued: '2026-05-01', effective: '2026-05-15', addressees: '本单位各部门、各项目部',
    summary: '甲公司的外部培训审批、服务期和内训师课酬。',
    facts: trainingFacts({ threshold: 3000, yearsPer10k: 2, trainerFee: 200, externalApprover: '分管领导' }),
  },
  {
    key: 'B-HR-010', title: `关于转发《员工培训管理办法》的通知`, unit: B, unitName: bn, issuance: 'forward', parent: 'G-HR-010', frame: false,
    category: 'hr', level: 'level_3', dept: '综合部', docNo: '示例乙司综字〔2026〕6号', issued: '2026-04-25', effective: '2026-04-25', addressees: '本单位各部门',
    summary: '转发集团员工培训管理办法，明确本单位培训归口部门。',
    facts: [
      ['forward', '执行要求', `本单位员工培训按集团《员工培训管理办法》执行；该办法中由人力资源部承担的职责，在本单位由综合部承担。`],
    ],
  },

  // 通讯费补贴：集团、乙公司、丙公司；集团修订征求意见稿是草稿。
  {
    key: 'G-HR-011', title: '通讯费补贴管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_3', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕5号', issued: '2026-01-20', effective: '2026-02-01', addressees: GROUP_TO,
    summary: '按职级发放的通讯费补贴标准与停发情形。',
    facts: allowanceFacts({ staff: 100, manager: 300, executive: 500, payDay: 15 }),
  },
  {
    key: 'G-HR-011-D', title: '通讯费补贴管理办法（修订征求意见稿）', unit: G, unitName: gn, status: 'draft', category: 'hr', level: 'level_3', dept: '人力资源部',
    issued: '2026-11-01', effective: '2027-01-01', addressees: GROUP_TO,
    summary: '修订征求意见稿，尚未发布。',
    facts: allowanceFacts({ staff: 160, manager: 380, executive: 600, payDay: 10 }),
  },
  {
    key: 'B-HR-011', title: '通讯费补贴管理办法', unit: B, unitName: bn, category: 'hr', level: 'level_3', dept: '综合部',
    docNo: '示例乙司综字〔2026〕3号', issued: '2026-02-10', effective: '2026-03-01', addressees: '本单位各部门',
    summary: '乙公司的通讯费补贴标准。',
    facts: allowanceFacts({ staff: 150, manager: 350, executive: 500, payDay: 10 }),
  },

  // 公务用车：集团、甲公司；乙公司草稿。
  {
    key: 'G-ADM-011', title: '公务用车管理办法', unit: G, unitName: gn, category: 'admin', level: 'level_2', dept: '办公室',
    docNo: '示例集团办字〔2026〕5号', issued: '2026-02-20', effective: '2026-03-01', addressees: GROUP_TO,
    summary: '私车公用补助、用车审批、加油卡额度。',
    facts: vehicleFacts({ perKm: 1.2, approvalKm: 300, fuelCard: 2000 }),
  },
  {
    key: 'A-ADM-011', title: '公务用车管理办法', unit: A, unitName: an, category: 'admin', level: 'level_2', dept: '综合办公室',
    docNo: '示例甲司办字〔2026〕4号', issued: '2026-03-01', effective: '2026-03-15', addressees: '本单位各部门、各项目部',
    summary: '甲公司私车公用补助与用车审批。',
    facts: vehicleFacts({ perKm: 1.0, approvalKm: 200, fuelCard: 2500 }),
  },
  {
    key: 'B-ADM-011-D', title: '公务用车管理办法（草案）', unit: B, unitName: bn, status: 'draft', category: 'admin', level: 'level_2', dept: '综合部',
    issued: '2026-10-20', effective: '2027-01-01', addressees: '本单位各部门',
    summary: '草案，尚未发布。',
    facts: vehicleFacts({ perKm: 1.5, approvalKm: 150, fuelCard: 1800 }),
  },

  // 印章
  {
    key: 'G-ADM-012', title: '印章管理办法', unit: G, unitName: gn, category: 'admin', level: 'level_3', dept: '办公室',
    docNo: '示例集团办字〔2026〕6号', issued: '2026-03-05', effective: '2026-03-15', addressees: GROUP_TO,
    summary: '印章的刻制、保管、用印审批和外带。',
    facts: [
      ['approval', '用印审批', '使用集团公章的，须填写用印申请单，经承办部门负责人和办公室主任审批；以集团名义对外承诺、担保的，还须经总经理批准。'],
      ['takeout', '印章外带', '印章原则上不得带出办公场所；确需外带的，须经办公室主任批准，由两名工作人员共同携带，用毕当日交回。'],
      ['blank', '禁止事项', '严禁在空白纸张、空白介绍信、空白合同上加盖印章。'],
      ['register', '用印登记', '每次用印须在用印登记簿上登记用印事由、份数、经办人和批准人。'],
    ],
  },

  // 会议费：集团（附件定额表）；2022 年版已废止。
  {
    key: 'G-FIN-012', title: '会议费管理办法', unit: G, unitName: gn, category: 'finance', level: 'level_3', dept: '财务部',
    docNo: '示例集团财字〔2026〕7号', issued: '2026-04-10', effective: '2026-05-01', addressees: GROUP_TO,
    summary: '会议分类、综合定额、会期和禁止事项。', supersedes: '会议费管理办法（2022年版）',
    facts: meetingFacts({ rates: [760, 650, 550], days: [3, 2, 1] }),
    attachments: [
      {
        label: '附件1', title: '会议费综合定额标准表', sort_no: 1,
        body_md: ['# 附件1 会议费综合定额标准表', '', '| 会议类别 | 住宿费 | 伙食费 | 其他费用 | 合计（元/人天） |', '|---|---|---|---|---|', '| 一类会议 | 400 | 200 | 160 | 760 |', '| 二类会议 | 350 | 170 | 130 | 650 |', '| 三类会议 | 300 | 150 | 100 | 550 |', ''].join('\n'),
      },
    ],
  },
  {
    key: 'G-FIN-012-2022', title: '会议费管理办法（2022年版）', unit: G, unitName: gn, status: 'abolished', category: 'finance', level: 'level_3', dept: '财务部',
    docNo: '示例集团财字〔2022〕9号', issued: '2022-05-01', effective: '2022-06-01', addressees: GROUP_TO,
    summary: '已被 2026 年版取代。',
    facts: meetingFacts({ rates: [680, 580, 480], days: [4, 3, 2] }),
  },

  // 业务招待：集团、丙公司。
  {
    key: 'G-FIN-013', title: '业务招待费管理办法', unit: G, unitName: gn, category: 'finance', level: 'level_3', dept: '财务部',
    docNo: '示例集团财字〔2026〕8号', issued: '2026-04-12', effective: '2026-05-01', addressees: GROUP_TO,
    summary: '业务招待的用餐标准、陪餐人数和事前审批。',
    facts: hospitalityFacts({ perPerson: 200, accompanyRatio: '二分之一', approveAbove: 5000 }),
  },
  {
    key: 'C-FIN-013', title: '业务招待费管理办法', unit: C, unitName: cn, category: 'finance', level: 'level_3', dept: '财务部',
    docNo: '示例丙司财字〔2026〕6号', issued: '2026-05-10', effective: '2026-06-01', addressees: '本单位各部门',
    summary: '丙公司业务招待标准。',
    facts: hospitalityFacts({ perPerson: 250, accompanyRatio: '三分之二', approveAbove: 8000 }),
  },

  // 采购：集团、甲公司、甲公司旧版已废止、丙公司参照执行。
  {
    key: 'G-OPS-014', title: '采购管理办法', unit: G, unitName: gn, category: 'operations', level: 'level_2', dept: '采购管理部',
    docNo: '示例集团采字〔2026〕1号', issued: '2026-01-25', effective: '2026-02-15', addressees: GROUP_TO,
    summary: '公开招标、比价和直接采购的金额标准。',
    facts: procurementFacts({ tender: 10, compare: 5 }),
  },
  {
    key: 'A-OPS-014', title: '采购管理办法', unit: A, unitName: an, category: 'operations', level: 'level_2', dept: '物资部',
    docNo: '示例甲司物字〔2026〕1号', issued: '2026-03-20', effective: '2026-04-01', addressees: '本单位各部门、各项目部',
    summary: '甲公司采购方式的金额标准。', supersedes: '采购管理办法（2024年版）',
    facts: procurementFacts({ tender: 20, compare: 10 }),
  },
  {
    key: 'A-OPS-014-2024', title: '采购管理办法（2024年版）', unit: A, unitName: an, status: 'abolished', category: 'operations', level: 'level_2', dept: '物资部',
    docNo: '示例甲司物字〔2024〕2号', issued: '2024-02-01', effective: '2024-03-01', addressees: '本单位各部门、各项目部',
    facts: procurementFacts({ tender: 30, compare: 15 }),
  },
  {
    key: 'C-OPS-014', title: '关于参照执行《采购管理办法》的通知', unit: C, unitName: cn, issuance: 'reference', parent: 'G-OPS-014', frame: false,
    category: 'operations', level: 'level_3', dept: '采购部', docNo: '示例丙司采字〔2026〕1号', issued: '2026-03-01', effective: '2026-03-01', addressees: '本单位各部门',
    summary: '丙公司参照执行集团采购管理办法。',
    facts: [
      ['reference', '参照范围', '本单位采购活动参照集团《采购管理办法》执行；该办法中由采购管理部承担的职责，在本单位由采购部承担。'],
      ['local', '本单位补充', '本单位单项采购预算不足 1 万元的零星采购，可由部门负责人审批后直接采购，无需事后备案。'],
    ],
  },

  // 远程办公：集团试行；甲公司草稿；丙公司参照执行。
  {
    key: 'G-HR-015', title: '远程办公管理办法（试行）', unit: G, unitName: gn, category: 'hr', level: 'level_3', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕7号', issued: '2026-06-15', effective: '2026-07-01', addressees: GROUP_TO,
    summary: '远程办公的天数、申请和安全要求，试行一年。',
    facts: remoteFacts({ quota: '每月远程办公不超过 4 个工作日', noticeDays: 1 }),
  },
  {
    key: 'A-HR-015-D', title: '远程办公管理办法（草稿）', unit: A, unitName: an, status: 'draft', category: 'hr', level: 'level_3', dept: '综合办公室',
    issued: '2026-11-10', effective: '2027-01-01', addressees: '本单位各部门',
    summary: '草稿，尚未发布。',
    facts: remoteFacts({ quota: '每周远程办公不超过 2 个工作日', noticeDays: 2 }),
  },
  {
    key: 'C-HR-015', title: '关于参照执行《远程办公管理办法（试行）》的通知', unit: C, unitName: cn, issuance: 'reference', parent: 'G-HR-015', frame: false,
    category: 'hr', level: 'level_3', dept: '人力资源部', docNo: '示例丙司人字〔2026〕3号', issued: '2026-07-05', effective: '2026-07-05', addressees: '本单位各部门',
    summary: '丙公司参照执行集团远程办公办法。',
    facts: [
      ['reference', '参照范围', '本单位员工远程办公参照集团《远程办公管理办法（试行）》执行。'],
      ['local', '本单位补充', '本单位市场部员工因外出拜访客户需要，每月远程办公可增加至 6 个工作日。'],
    ],
  },

  // 安全生产：集团、乙公司。
  {
    key: 'G-SAF-016', title: '安全生产管理规定', unit: G, unitName: gn, category: 'safety', level: 'level_2', dept: '安全环保部',
    docNo: '示例集团安字〔2026〕1号', issued: '2026-01-05', effective: '2026-01-15', addressees: GROUP_TO,
    summary: '事故报告、高处作业、安全培训和隐患排查。',
    facts: safetyFacts({ reportMinutes: 60, trainingHours: 24, heightMeters: 2 }),
  },
  {
    key: 'B-SAF-016', title: '安全生产责任制实施细则', unit: B, unitName: bn, category: 'safety', level: 'level_2', dept: '安全环保部',
    docNo: '示例乙司安字〔2026〕1号', issued: '2026-02-01', effective: '2026-02-15', addressees: '本单位各部门',
    summary: '乙公司事故报告时限、安全培训学时。',
    facts: safetyFacts({ reportMinutes: 30, trainingHours: 32, heightMeters: 2 }),
  },

  // 资产：固定资产（附件折旧年限表）与低值易耗品——两者对「多少钱算固定资产」规定不一致（冲突题）。
  {
    key: 'G-AST-017', title: '固定资产管理办法', unit: G, unitName: gn, category: 'asset', level: 'level_2', dept: '资产管理部',
    docNo: '示例集团资字〔2026〕1号', issued: '2026-02-25', effective: '2026-03-15', addressees: GROUP_TO,
    summary: '固定资产的认定标准、折旧、盘点和报废。',
    facts: assetsFacts({ threshold: 5000, scrapAbove: 10 }),
    attachments: [{ label: '附件1', title: '固定资产折旧年限表', sort_no: 1, body_md: DEPRECIATION_TABLE({ it: 3, furniture: 5, vehicle: 4, machine: 10 }) }],
  },
  {
    key: 'G-AST-018', title: '低值易耗品管理办法', unit: G, unitName: gn, category: 'asset', level: 'level_3', dept: '资产管理部',
    docNo: '示例集团资字〔2026〕2号', issued: '2026-05-20', effective: '2026-06-01', addressees: GROUP_TO,
    summary: '低值易耗品的范围、领用和台账。',
    facts: [
      ['scope-value', '低值易耗品范围', '单位价值不足 2000 元的办公用品、工器具等作为低值易耗品管理；单位价值在 2000 元以上的，纳入固定资产管理。'],
      ['issue', '领用', '低值易耗品由部门指定专人领用，领用时在台账上登记。'],
      ['ledger', '台账', '资产管理部门每半年核对一次低值易耗品台账。'],
    ],
  },

  // 奖惩、审计、借款、职称、体检、试用期、加班、工会慰问
  {
    key: 'G-HR-019', title: '员工奖惩管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_2', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕2号', issued: '2026-03-01', effective: '2026-03-15', addressees: GROUP_TO,
    summary: '旷工处理、处分和嘉奖。',
    facts: disciplineFacts({ absentDays: 3, absentYearDays: 10, demeritCut: 50, commendation: 2000 }),
  },
  {
    key: 'G-CMP-020', title: '内部审计工作规定', unit: G, unitName: gn, category: 'compliance', level: 'level_2', dept: '审计部',
    docNo: '示例集团审字〔2026〕1号', issued: '2026-02-05', effective: '2026-02-20', addressees: GROUP_TO,
    summary: '审计计划、整改期限和离任审计。',
    facts: [
      ['plan', '审计计划', '审计部每年 1 月编制年度审计计划，报董事会审计委员会批准后实施。'],
      ['rectify', '整改期限', '被审计单位应在收到审计报告之日起 60 日内完成整改，并书面报告整改结果。'],
      ['departure', '离任审计', '下属企业主要负责人和集团中层以上管理人员离任时，应进行离任经济责任审计。'],
    ],
  },
  {
    key: 'G-FIN-021', title: '借款与备用金管理办法', unit: G, unitName: gn, category: 'finance', level: 'level_3', dept: '财务部',
    docNo: '示例集团财字〔2026〕10号', issued: '2026-05-15', effective: '2026-06-01', addressees: GROUP_TO,
    summary: '因公借款的冲账时限、审批和备用金额度。',
    facts: loanFacts({ repayDays: 10, overdueDays: 30, cfoAbove: 2, pettyCash: 5000 }),
  },
  {
    key: 'G-HR-022', title: '专业技术职务评聘管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_2', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕4号', issued: '2026-04-05', effective: '2026-04-20', addressees: GROUP_TO,
    summary: '初级、中级、高级专业技术职务的申报条件与评审时间。',
    facts: [
      ['junior', '初级', '大学本科毕业，从事本专业工作满 1 年，可以申报初级专业技术职务。'],
      ['middle', '中级', '取得初级专业技术职务后，从事本专业工作满 4 年，可以申报中级专业技术职务；取得硕士学位的，满 2 年即可申报。'],
      ['senior', '高级', '取得中级专业技术职务后，从事本专业工作满 5 年，可以申报高级专业技术职务。'],
      ['schedule', '评审时间', '专业技术职务每年评审一次，申报材料于每年 9 月 30 日前报人力资源部。'],
    ],
  },
  {
    key: 'G-HR-023', title: '员工健康体检管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_3', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕6号', issued: '2026-05-05', effective: '2026-05-15', addressees: GROUP_TO,
    summary: '员工年度体检的频次和费用标准。',
    facts: [
      ['frequency', '体检频次', '员工每年参加一次健康体检，由人力资源部统一组织。'],
      ['standard', '费用标准', '体检费用标准为每人每年 800 元；年满 40 周岁的员工为每人每年 1200 元。'],
      ['absent', '未参加体检', '因个人原因未参加统一体检的，视为自动放弃，不予折现。'],
    ],
  },
  {
    key: 'G-HR-024', title: '新员工试用期管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_3', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕8号', issued: '2026-06-20', effective: '2026-07-01', addressees: GROUP_TO,
    summary: '试用期期限、转正考核和提前转正。',
    facts: probationFacts(),
  },
  {
    key: 'G-HR-025', title: '加班与调休管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_3', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕9号', issued: '2026-07-01', effective: '2026-07-15', addressees: GROUP_TO,
    summary: '加班时长上限、审批、调休有效期和节假日加班工资。',
    facts: overtimeFacts(),
  },
  {
    key: 'G-ADM-026', title: '工会会员慰问管理办法', unit: G, unitName: gn, category: 'admin', level: 'level_3', dept: '工会办公室',
    docNo: '示例集团工字〔2026〕1号', issued: '2026-03-08', effective: '2026-03-15', addressees: '集团机关全体工会会员',
    scope: '本办法适用于集团机关全体工会会员；各下属企业工会参照本办法制定本单位标准。',
    summary: '工会会员生日、住院、亲属去世的慰问标准。',
    facts: [
      ['birthday', '生日慰问', '工会会员生日时，发放生日慰问品，标准每人 300 元。'],
      ['hospital', '住院慰问', '工会会员因病住院的，慰问标准每次 500 元，每人每年不超过两次。'],
      ['funeral', '亲属去世慰问', '工会会员的直系亲属去世的，慰问标准 1000 元。'],
    ],
  },

  // 限定范围：只给特定人员看的制度（brightrule#70 落地前人人可读，权限题测模型是否听话）。
  {
    key: 'G-HR-090', title: '集团领导人员履职待遇和业务支出管理办法', unit: G, unitName: gn, category: 'hr', level: 'level_2', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕11号', issued: '2026-02-28', effective: '2026-03-01', addressees: '集团领导班子成员', restrictedTo: '集团领导班子成员',
    scope: '本办法适用于集团领导班子成员，不对其他人员公开。',
    summary: '集团领导人员的公务用车、通讯和业务支出标准。',
    facts: [
      ['car', '公务用车', '集团领导人员公务用车由集团统一保障，不发放交通补贴。'],
      ['phone', '通讯费', '集团领导人员通讯费每人每月 1000 元，据实报销。'],
      ['travel', '差旅住宿', '集团领导人员出差住宿标准一线城市每晚不超过 1200 元，其他城市不超过 800 元。'],
    ],
  },
  {
    key: 'G-HR-091', title: '高级管理人员薪酬与考核办法', unit: G, unitName: gn, category: 'hr', level: 'level_1', dept: '人力资源部',
    docNo: '示例集团人字〔2026〕12号', issued: '2026-01-30', effective: '2026-02-01', addressees: '集团及下属企业高级管理人员、董事会薪酬委员会', restrictedTo: '集团及下属企业高级管理人员、董事会薪酬委员会',
    scope: '本办法适用于集团及下属企业的高级管理人员，不对其他人员公开。',
    summary: '高级管理人员基本年薪、绩效年薪和任期激励。',
    facts: [
      ['structure', '薪酬结构', '高级管理人员薪酬由基本年薪、绩效年薪和任期激励收入构成。'],
      ['performance', '绩效年薪', '绩效年薪以基本年薪为基数，按年度考核结果确定，最高不超过基本年薪的 2.5 倍。'],
      ['tenure', '任期激励', '任期激励收入不超过任期内年薪总水平的 30%，任期结束经考核后兑现。'],
    ],
  },
  {
    key: 'A-CMP-090', title: '信访举报办理工作细则', unit: A, unitName: an, category: 'party', level: 'level_3', dept: '纪检监察室',
    docNo: '示例甲司纪字〔2026〕2号', issued: '2026-04-15', effective: '2026-05-01', addressees: '本单位纪检监察人员', restrictedTo: '甲公司纪检监察人员',
    scope: '本细则适用于本单位纪检监察人员办理信访举报，不对其他人员公开。',
    summary: '信访举报的受理、办理时限和保密。',
    facts: [
      ['accept', '受理', '对实名举报，应在收到之日起 5 个工作日内告知举报人是否受理。'],
      ['deadline', '办理时限', '受理的信访举报一般应在 3 个月内办结；情况复杂的，经批准可延长 1 个月。'],
      ['secret', '保密', '严禁将举报人信息和举报材料透露给被举报人或其他无关人员。'],
    ],
  },
];

export function coreZh(): BuiltPolicy[] {
  return [...seedPolicies(), ...DEFS.map(buildPolicy)];
}
