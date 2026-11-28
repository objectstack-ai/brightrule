/**
 * Chinese policy families: one function per kind of policy, taking the numbers
 * that differ between units and returning the fact articles. The core corpus
 * calls each with hand-picked numbers (同名不同标准 between the group and its
 * subsidiaries); the distractor generator calls the same functions with
 * random numbers, so a distractor of the same name has a full, plausible body.
 *
 * Fact ids are stable per family: a question names 「the lodging article of
 * DEMO-A's travel policy」 and the build resolves it to 第X条.
 */
import type { Fact } from './build-policy.js';

export interface TravelParams {
  longTripDays: number;
  /** Flat lodging caps, or caps by rank. */
  lodging: { first: number; other: number } | { staff: [number, number]; manager: [number, number]; executive: [number, number] };
  meal: number;
  taxi: number;
  deadlineDays: number;
  /** Rank from which first class / business class is allowed. */
  premiumFrom: '中层管理人员' | '高级管理人员';
}

export const travelFacts = (p: TravelParams): Fact[] => [
  ['approval', '出差审批', `员工出差须事先填写出差审批单，经部门负责人批准；连续出差超过 ${p.longTripDays} 天的，还须经分管领导批准。`],
  ['transport', '城市间交通', `乘坐火车的，员工乘二等座，${p.premiumFrom}及以上可乘一等座；乘坐飞机的，员工乘经济舱，${p.premiumFrom}及以上经批准可乘公务舱。`],
  [
    'lodging',
    '住宿标准',
    'first' in p.lodging
      ? `一线城市（北京、上海、广州、深圳）住宿标准为每晚不超过 ${p.lodging.first} 元，其他城市不超过 ${p.lodging.other} 元，超标部分由个人承担。`
      : `住宿标准按职级执行：普通员工一线城市（北京、上海、广州、深圳）每晚不超过 ${p.lodging.staff[0]} 元、其他城市不超过 ${p.lodging.staff[1]} 元；中层管理人员一线城市每晚不超过 ${p.lodging.manager[0]} 元、其他城市不超过 ${p.lodging.manager[1]} 元；高级管理人员一线城市每晚不超过 ${p.lodging.executive[0]} 元、其他城市不超过 ${p.lodging.executive[1]} 元。超标部分由个人承担。`,
  ],
  ['meal', '伙食补贴', `出差伙食补贴每人每天 ${p.meal} 元，按实际出差天数计算，出发和返回当天各按半天计算，不再另行报销餐费。`],
  ['taxi', '市内交通', `出差期间市内交通可乘坐网约车或出租车，凭发票及行程单报销，单日不超过 ${p.taxi} 元。`],
  ['deadline', '报销时限', `出差结束后 ${p.deadlineDays} 个工作日内办理报销；逾期未报销的，须说明原因并经部门负责人签字后方可受理。`],
];

export interface LeaveParams {
  annual: [number, number, number];
  sickApproveDays: number;
  marriage: number;
  bereavement: number;
  carryOverMonths: number;
}

export const leaveFacts = (p: LeaveParams): Fact[] => [
  ['worktime', '工作时间', '实行每日 8 小时、每周 40 小时的标准工时制度，具体作息时间由各部门按本单位规定执行。'],
  ['annual', '年休假天数', `员工累计工作满 1 年不满 10 年的，年休假 ${p.annual[0]} 天；满 10 年不满 20 年的，年休假 ${p.annual[1]} 天；满 20 年的，年休假 ${p.annual[2]} 天。`],
  ['carryover', '年休假跨年', `当年未休完的年休假可顺延至次年 ${p.carryOverMonths} 月底前休完，逾期不再保留。`],
  ['sick', '病假', `病假须提供二级以上医院诊断证明；连续病假 ${p.sickApproveDays} 天以内由部门负责人审批，超过 ${p.sickApproveDays} 天的须部门负责人及人力资源部审批。`],
  ['marriage', '婚假', `员工依法登记结婚的，享受婚假 ${p.marriage} 天（含法定婚假），须在登记之日起一年内一次休完。`],
  ['bereavement', '丧假', `员工的直系亲属去世的，给予丧假 ${p.bereavement} 天。`],
];

export interface TrainingParams {
  threshold: number;
  yearsPer10k: number;
  trainerFee: number;
  externalApprover: string;
}

export const trainingFacts = (p: TrainingParams): Fact[] => [
  ['plan', '培训计划', '各部门每年 12 月底前报送下一年度培训需求，人力资源部汇总编制年度培训计划，报分管领导批准后实施。'],
  ['external', '外部培训审批', `参加外部培训的，须填写外部培训申请表，经部门负责人和${p.externalApprover}审批。`],
  ['service', '服务期协议', `单人单次外部培训费用在 ${p.threshold} 元以上的，员工须与公司签订服务期协议；培训费用每 1 万元约定服务期 ${p.yearsPer10k} 年，不足 1 万元的部分按 1 万元计算。`],
  ['penalty', '违约金', '员工在服务期内离职的，按未履行服务期占约定服务期的比例返还培训费用，即：返还金额 = 培训费用 × 未履行服务期月数 ÷ 约定服务期月数。'],
  ['trainer', '内训师课酬', `经认定的内部培训师授课，课酬每课时 ${p.trainerFee} 元，每课时按 45 分钟计算。`],
];

export interface AllowanceParams {
  staff: number;
  manager: number;
  executive: number;
  payDay: number;
}

export const allowanceFacts = (p: AllowanceParams): Fact[] => [
  ['phone', '通讯费补贴', `通讯费补贴按月发放：普通员工每月 ${p.staff} 元，中层管理人员每月 ${p.manager} 元，高级管理人员每月 ${p.executive} 元。`],
  ['payday', '发放方式', `补贴随当月工资于每月 ${p.payDay} 日发放；当月出勤不足 10 个工作日的，补贴减半发放。`],
  ['stop', '停发情形', '员工离职、停薪留职或长期病休（连续超过 3 个月）的，自次月起停发通讯费补贴。'],
];

export interface VehicleParams {
  perKm: number;
  approvalKm: number;
  fuelCard: number;
}

export const vehicleFacts = (p: VehicleParams): Fact[] => [
  ['private', '私车公用', `经批准使用私人车辆办理公务的，按实际行驶里程每公里 ${p.perKm} 元给予补助，不再另行报销油费和过路费。`],
  ['approval', '用车审批', `单次往返里程超过 ${p.approvalKm} 公里的公务用车，须事先报分管领导批准。`],
  ['nopersonal', '禁止私用', '公务车辆不得用于接送上下班、婚丧嫁娶、休闲旅游等私人事务。'],
  ['fuel', '加油卡', `公务车辆加油统一使用单位加油卡，每车每月加油额度不超过 ${p.fuelCard} 元，超出部分须说明原因。`],
];

export interface MeetingParams {
  rates: [number, number, number];
  days: [number, number, number];
}

export const meetingFacts = (p: MeetingParams): Fact[] => [
  ['classes', '会议分类', '会议分为三类：一类会议是集团年度工作会议；二类会议是集团各部门、各单位召开的业务工作会议；三类会议是其他小型专题会议。'],
  ['rates', '综合定额', `会议费实行综合定额控制，包括住宿费、伙食费、会议室租金等。一类会议每人每天不超过 ${p.rates[0]} 元，二类会议不超过 ${p.rates[1]} 元，三类会议不超过 ${p.rates[2]} 元，各类会议定额见附件1。`],
  ['days', '会期', `一类会议会期不超过 ${p.days[0]} 天，二类会议不超过 ${p.days[1]} 天，三类会议不超过 ${p.days[2]} 天；报到和离开时间合计不超过 1 天。`],
  ['ban', '禁止事项', '会议不得安排宴请，不得组织旅游以及与会议无关的参观，不得发放纪念品。'],
];

export interface HospitalityParams {
  perPerson: number;
  accompanyRatio: string;
  approveAbove: number;
}

export const hospitalityFacts = (p: HospitalityParams): Fact[] => [
  ['standard', '招待标准', `业务招待用餐每人次不超过 ${p.perPerson} 元（含酒水），不得提供高档菜肴和香烟。`],
  ['accompany', '陪餐人数', `陪餐人数原则上不超过接待对象人数的${p.accompanyRatio}；接待对象在 10 人以内的，陪餐人数不超过 3 人。`],
  ['approval', '事前审批', `业务招待须事先填写招待审批单；单次招待预计费用超过 ${p.approveAbove} 元的，须经总经理批准。`],
];

export interface ProcurementParams {
  tender: number;
  compare: number;
}

export const procurementFacts = (p: ProcurementParams): Fact[] => [
  ['tender', '公开招标', `单项采购预算 ${p.tender} 万元以上的，应当公开招标。`],
  ['compare', '比价采购', `单项采购预算 ${p.compare} 万元以上、不足 ${p.tender} 万元的，应当邀请不少于三家供应商比价。`],
  ['direct', '直接采购', `单项采购预算不足 ${p.compare} 万元的，可由需求部门直接采购，事后报采购管理部门备案。`],
  ['split', '禁止拆分', '不得将应当公开招标的项目化整为零或者以其他方式规避招标。'],
];

export interface RemoteParams {
  quota: string;
  noticeDays: number;
}

export const remoteFacts = (p: RemoteParams): Fact[] => [
  ['quota', '远程办公天数', `员工因工作需要可申请远程办公，${p.quota}。`],
  ['apply', '申请方式', `远程办公须提前 ${p.noticeDays} 个工作日在办公系统提交申请，经部门负责人同意。`],
  ['security', '安全要求', '远程办公期间不得使用公共场所无密码网络处理内部及以上密级的工作资料，须通过公司 VPN 接入内部系统。'],
  ['excluded', '不适用岗位', '生产一线、安保值班及需现场作业的岗位不适用远程办公。'],
];

export interface SafetyParams {
  reportMinutes: number;
  trainingHours: number;
  heightMeters: number;
}

export const safetyFacts = (p: SafetyParams): Fact[] => [
  ['report', '事故报告', `发生生产安全事故后，现场人员应立即报告本单位负责人，单位负责人接到报告后 ${p.reportMinutes} 分钟内报告上级安全管理部门。`],
  ['height', '高处作业', `在 ${p.heightMeters} 米以上（含 ${p.heightMeters} 米）有可能坠落的高处作业，作业人员必须系好安全带。`],
  ['training', '安全培训', `从业人员每年接受安全生产教育培训的时间不少于 ${p.trainingHours} 学时。`],
  ['hazard', '隐患排查', '各部门每月至少开展一次安全隐患排查，发现的隐患须登记建档并限期整改。'],
];

export interface AssetsParams {
  threshold: number;
  scrapAbove: number;
}

export const assetsFacts = (p: AssetsParams): Fact[] => [
  ['threshold', '固定资产标准', `单位价值在 ${p.threshold} 元以上（含 ${p.threshold} 元）、使用年限超过一年的设备、家具和车辆等，作为固定资产管理。`],
  ['depreciation', '折旧', '固定资产按年限平均法计提折旧，各类资产的折旧年限见附件1。'],
  ['inventory', '资产盘点', '资产管理部门每年 12 月组织一次全面盘点，盘盈盘亏须查明原因并报财务部门处理。'],
  ['scrap', '报废审批', `固定资产报废须经资产管理部门鉴定；原值在 ${p.scrapAbove} 万元以上的，报总经理办公会审批。`],
];

export const DEPRECIATION_TABLE = (years: { it: number; furniture: number; vehicle: number; machine: number }) =>
  [
    '# 附件1 固定资产折旧年限表',
    '',
    '| 资产类别 | 示例 | 折旧年限（年） |',
    '|---|---|---|',
    `| 电子设备 | 电脑、打印机、投影仪 | ${years.it} |`,
    `| 办公家具 | 办公桌椅、文件柜 | ${years.furniture} |`,
    `| 运输设备 | 公务车辆 | ${years.vehicle} |`,
    `| 机器设备 | 生产设备、检测仪器 | ${years.machine} |`,
    '',
  ].join('\n');

export interface DisciplineParams {
  absentDays: number;
  absentYearDays: number;
  demeritCut: number;
  commendation: number;
}

export const disciplineFacts = (p: DisciplineParams): Fact[] => [
  ['absent', '旷工处理', `员工连续旷工 ${p.absentDays} 个工作日以上，或者一年内累计旷工 ${p.absentYearDays} 个工作日以上的，公司可以解除劳动合同。`],
  ['absent-exception', '不计旷工的情形', '因自然灾害等不可抗力未能到岗，事后 3 个工作日内补办手续并经核实的，不按旷工处理。'],
  ['demerit', '记过', `受到记过处分的，扣发当月绩效工资的 ${p.demeritCut}%，当年年度考核不得评为优秀。`],
  ['commend', '嘉奖', `受到公司嘉奖的，给予一次性奖励 ${p.commendation} 元。`],
];

export interface LoanParams {
  repayDays: number;
  overdueDays: number;
  cfoAbove: number;
  pettyCash: number;
}

export const loanFacts = (p: LoanParams): Fact[] => [
  ['repay', '借款冲账', `因公借款的，应在事项结束后 ${p.repayDays} 个工作日内办理报销冲账；出差借款的，在出差结束后 ${p.repayDays} 个工作日内冲账。`],
  ['overdue', '逾期处理', `借款逾期超过 ${p.overdueDays} 日未冲账的，财务部门可从借款人工资中扣回。`],
  ['approval', '借款审批', `单笔借款 ${p.cfoAbove} 万元以下由部门负责人审批；${p.cfoAbove} 万元以上的，还须经财务总监审批。`],
  ['petty', '备用金', `部门备用金额度不超过 ${p.pettyCash} 元，每季度末清理一次。`],
];

export const probationFacts = (): Fact[] => [
  ['period', '试用期期限', '劳动合同期限三个月以上不满一年的，试用期不超过一个月；一年以上不满三年的，试用期不超过二个月；三年以上固定期限和无固定期限的，试用期不超过六个月。'],
  ['review', '转正考核', '试用期满前 10 个工作日，由用人部门组织转正考核，考核合格的办理转正手续。'],
  ['early', '提前转正', '试用期表现特别优秀的，经部门负责人推荐、人力资源部审核，可以提前转正，但试用期不得少于约定期限的一半。'],
];

export const overtimeFacts = (): Fact[] => [
  ['limit', '加班时长', '因工作需要安排加班的，每月加班时间累计不超过 36 小时。'],
  ['approval', '加班审批', '加班须事先在考勤系统提交申请，经部门负责人批准；未经批准的，不认定为加班。'],
  ['comp', '调休', '工作日延时加班和休息日加班，优先安排调休；调休须在加班之日起 6 个月内使用，逾期作废。'],
  ['holiday', '法定节假日加班', '法定节假日安排加班的，按不低于本人日工资的 300% 支付加班工资，不安排调休。'],
];
