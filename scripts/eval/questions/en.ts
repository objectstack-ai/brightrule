/**
 * The English sample's questions (Jack 2026-11-28): English questions on the
 * English policies, English questions on the Chinese group policies, and
 * Chinese questions on the English policies. The answer should come back in
 * the language of the question.
 *
 * Persona chains: p-uk-staff UK → INTL → 集团; p-sg-* SG → INTL → 集团;
 * p-intl-staff INTL → 集团; p-en-nounit no unit (says Singapore when asked);
 * p-g-staff / p-a-staff / p-c-staff are the Chinese personas asking in English.
 */
import type { Question } from '../schema.js';
import { fv, q, type QOpts } from './build.js';

const EN = { qlang: 'en', plang: 'en' } as const;
const EN_ZH = { qlang: 'en', plang: 'zh' } as const;
const ZH_EN = { qlang: 'zh', plang: 'en' } as const;
const NB = { noBasis: true } as const;
const e = (o: QOpts): QOpts => ({ ...EN, ...o });
const ez = (o: QOpts): QOpts => ({ ...EN_ZH, ...o });
const ze = (o: QOpts): QOpts => ({ ...ZH_EN, ...o });

const enEn: Question[] = [
  q('en-direct-01', 'direct', 'p-intl-staff', 'What is the hotel limit per night in London?', e({ a: [['INTL-TRV-001', 'hotel']], v: ['250'], forbid: [fv('200', 'the abolished 2023 policy', 'night')], pts: ['USD 250 per night in Tier A cities such as London'] })),
  q('en-direct-02', 'direct', 'p-intl-staff', 'How much is the daily meal per diem on business trips?', e({ a: [['INTL-TRV-001', 'perdiem']], v: ['60'], pts: ['USD 60 for each full day away', 'no meal receipts on top'] })),
  q('en-direct-03', 'direct', 'p-intl-staff', 'How many days of annual leave do I get?', e({ a: [['INTL-HR-002', 'annual']], v: ['18'], pts: ['18 working days per calendar year, pro-rated in the joining year'] })),
  q('en-direct-04', 'direct', 'p-intl-staff', 'How many unused leave days can I carry over, and by when do I have to use them?', e({ a: [['INTL-HR-002', 'carryover']], v: ['5', '31 March'], pts: ['up to 5 days', 'must be taken by 31 March of the following year'] })),
  q('en-direct-05', 'direct', 'p-intl-staff', 'When do I need a medical certificate for sick leave?', e({ a: [['INTL-HR-002', 'sick']], v: ['2'], pts: ['for more than 2 consecutive working days'] })),
  q('en-direct-06', 'direct', 'p-intl-staff', 'How long does my password have to be?', e({ a: [['INTL-IT-003', 'password']], v: ['12'], pts: ['at least 12 characters', 'MFA on every company account'] })),
  q('en-direct-07', 'direct', 'p-intl-staff', 'How quickly do I have to report a lost laptop?', e({ a: [['INTL-IT-003', 'incident']], v: ['1 hour'], pts: ['to the IT Service Desk within 1 hour'] })),
  q('en-direct-08', 'direct', 'p-intl-staff', 'What is the maximum value of a gift I can accept?', e({ a: [['INTL-CMP-004', 'limit']], v: ['100', '5'], pts: ['up to USD 100', 'above that, declare in the Gift Register within 5 business days'] })),
  q('en-direct-09', 'direct', 'p-intl-staff', 'How many days a week can I work from home?', e({ a: [['INTL-HR-005', 'quota']], v: ['2'], forbid: [fv('3', 'the abolished 2024 policy', 'week')], pts: ['up to 2 days per week, agreed with the line manager'] })),
  q('en-direct-10', 'direct', 'p-intl-staff', 'What is my annual learning budget?', e({ a: [['INTL-HR-006', 'budget']], v: [{ value: '1,500', any_of: ['1500'] }], pts: ['USD 1,500 per year'] })),
  q('en-unit-01', 'unit_scope', 'p-uk-staff', 'How many days of annual leave do I get?', e({ a: [['UK-HR-002', 'annual']], v: ['25'], forbid: [fv('18', 'the overseas group policy, replaced by the UK one for UK staff', 'days')], pts: ['UK: 25 days plus public holidays'] })),
  q('en-unit-02', 'unit_scope', 'p-uk-staff', 'What is the hotel cap for a night in Manchester?', e({ a: [['UK-TRV-001', 'hotel']], v: ['130'], pts: ['GBP 130 per night outside London'] })),
  q('en-unit-03', 'unit_scope', 'p-uk-staff', 'Up to what value can I accept a gift?', e({ a: [['UK-CMP-004', 'limit']], v: ['50', '10'], pts: ['GBP 50', 'above that, record it within 10 business days'] })),
  q('en-unit-04', 'unit_scope', 'p-uk-staff', 'How many days do I need to be in the office each week?', e({ a: [['UK-HR-010', 'office']], v: ['3'], pts: ['at least 3 days per week during the trial'] })),
  q('en-unit-05', 'unit_scope', 'p-sg-staff', 'Can I use a USB stick on my work laptop?', e({ a: [['SG-IT-003', 'usb']], pts: ['No: USB storage is blocked on Singapore laptops', 'exceptions need written approval from SG IT'] })),
  q('en-unit-06', 'unit_scope', 'p-en-nounit', 'What about the gift limit?', e({ ctx: ['I work for Example UK Ltd. Quick question first: how many days of annual leave do I get?'], a: [['UK-CMP-004', 'limit']], v: ['50'], pts: ['keeps the UK company stated earlier', 'GBP 50'], note: 'multi-turn: the unit stated earlier carries over' })),
  q('en-calc-01', 'calculation', 'p-uk-staff', 'I drove 12,000 business miles this tax year. How much mileage can I claim?', e({ a: [['UK-TRV-001', 'mileage']], v: [{ value: '4,400', any_of: ['4400'] }], pts: ['10,000 × 0.40 + 2,000 × 0.20 = GBP 4,400'] })),
  q('en-calc-02', 'calculation', 'p-intl-staff', 'I am resigning 8 months after finishing a USD 1,200 course. How much do I have to repay?', e({ a: [['INTL-HR-006', 'repayment']], v: ['600'], pts: ['6–12 months: 50%', '1,200 × 50% = USD 600'] })),
  q('en-calc-03', 'calculation', 'p-intl-staff', 'For a 3-night trip to Tokyo, what is the most I can spend on the hotel?', e({ a: [['INTL-TRV-001', 'hotel']], v: ['750'], pts: ['Tokyo is Tier A: 250 × 3 = USD 750'] })),
  q('en-rank-01', 'rank_tier', 'p-sg-staff', 'How much annual leave do I get?', e({ a: [['SG-HR-002', 'annual']], v: ['14'], clarify: true, pts: ['by grade: staff 14 days, managers 18 days; ask the grade', 'staff: 14 days'] })),
  q('en-rank-02', 'rank_tier', 'p-sg-mgr', 'What is my hotel limit in New York?', e({ a: [['SG-TRV-001', 'hotel']], v: ['280'], clarify: true, pts: ['caps by grade; ask the grade', 'managers: USD 280 in Tier A cities'] })),
  q('en-rank-02b', 'rank_tier', 'p-sg-mgr', "I'm a manager. How many days of annual leave do I get?", e({ a: [['SG-HR-002', 'annual']], v: ['18'], pts: ['managers: 18 days'] })),
  q('en-cross-01', 'cross_reference', 'p-uk-staff', 'What are the core hours when I work from home?', e({ a: [['UK-HR-010', 'other'], ['INTL-HR-005', 'core']], v: ['10:00', '16:00'], pts: ['the UK guidelines refer to the overseas Remote Work Policy', 'core hours 10:00 to 16:00 local time'] })),
  q('en-cross-02', 'cross_reference', 'p-sg-staff', 'Apart from the USB rule, what are the password rules in Singapore?', e({ a: [['SG-IT-003', 'adopt'], ['INTL-IT-003', 'password']], v: ['12'], pts: ['Singapore adopts the overseas Information Security Policy', 'at least 12 characters and MFA'] })),
  q('en-cross-03', 'cross_reference', 'p-intl-staff', 'A supplier invited me to a dinner worth about USD 200 per person. Can I go?', e({ a: [['INTL-CMP-004', 'hospitality']], v: ['150'], pts: ['up to USD 150 per person is acceptable', 'above that needs prior approval from Compliance'] })),
  q('en-nobasis-01', 'no_basis', 'p-intl-staff', 'How many weeks of maternity leave do I get?', e({ ...NB, absent: ['maternity', '产假'], pts: ['no policy in force covers maternity leave', 'the UK draft is not in force and is not for this company anyway'] })),
  q('en-nobasis-02', 'no_basis', 'p-uk-staff', 'Is there a cycle-to-work scheme?', e({ ...NB, absent: ['cycle', 'bicycle', '自行车'], pts: ['no policy found'] })),
  q('en-nobasis-03', 'no_basis', 'p-sg-staff', 'Does the company pay for my gym membership?', e({ ...NB, absent: ['gym', '健身'], pts: ['no policy found'] })),
  q('en-nobasis-04', 'no_basis', 'p-intl-staff', 'Can I bring my dog to the office?', e({ ...NB, absent: ['pets', 'dogs', 'animal', '宠物'], pts: ['no policy found'] })),
  q('en-perm-draft-01', 'permission', 'p-uk-staff', 'How much paternity leave do I get?', e({ perm: 'draft', ...NB, absent: ['paternity'], forbid: [fv('4', 'the UK parental leave draft, not in force', 'week')], pts: ['no policy in force covers paternity leave', 'a draft exists but is not in force'] })),
  q('en-perm-restricted-01', 'permission', 'p-intl-staff', 'What is the bonus cap for executive directors?', e({ perm: 'restricted', ...NB, forbid: [fv('120%', 'restricted to executive directors and the Remuneration Committee')], pts: ['does not disclose a restricted policy'] })),
  q('en-perm-abolished-01', 'permission', 'p-intl-staff', 'How long do I have to submit an expense claim after a trip?', e({ perm: 'abolished', a: [['INTL-TRV-001', 'claims']], v: ['30'], forbid: [fv('60', 'the abolished 2023 policy', 'days')], pts: ['within 30 days of returning'] })),
  q('en-perm-peer-01', 'permission', 'p-sg-staff', 'How many days a week do I have to come into the office?', e({ perm: 'peer', a: [['INTL-HR-005', 'quota']], v: ['2'], forbid: [fv('3', "the UK company's hybrid rule (a peer)", 'office')], pts: ['Singapore has no own rule: the overseas policy allows up to 2 remote days per week'] })),
  q('en-clarify-01', 'clarify', 'p-en-nounit', 'What is the hotel cap in Singapore?', e({ a: [['SG-TRV-001', 'hotel']], v: ['220'], clarify: true, reply: 'I am a staff member at Example Singapore Pte. Ltd.', pts: ['caps differ by company and grade: ask once', 'Singapore staff: USD 220 in Tier A cities'] })),
  q('en-clarify-02', 'clarify', 'p-en-nounit', 'How many days of annual leave do I get?', e({ a: [['SG-HR-002', 'annual']], v: ['14'], clarify: true, reply: 'I am a staff member at Example Singapore Pte. Ltd.', pts: ['entitlements differ by company: ask once', 'Singapore staff: 14 days'] })),
  q('en-clarify-03', 'clarify', 'p-en-nounit', 'How fast must a security incident be reported?', e({ a: [['INTL-IT-003', 'incident']], v: ['1 hour'], pts: ['the same overseas rule applies everywhere: answer without asking', 'within 1 hour'] })),
  q('en-pinned-01', 'pinned', 'p-intl-staff', 'Do I need approval for a USD 1,200 course?', e({ pin: 'INTL-HR-006', a: [['INTL-HR-006', 'approval']], v: ['1,000'], pts: ['yes: above USD 1,000 needs both the line manager and HR'] })),
];

const enZh: Question[] = [
  q('enzh-direct-01', 'direct', 'p-uk-staff', "Under the group's contract rules, what contract value needs a legal review?", ez({ a: [['CMP-005', '第十五条']], v: ['50 万'], pts: ['RMB 500,000 or more, or a penalty above 20% of the contract value', 'answered in English'] })),
  q('enzh-direct-02', 'direct', 'p-intl-staff', 'How many days in advance must directors be notified of a regular group board meeting?', ez({ a: [['GOV-006', '第九条']], v: ['10'], pts: ['10 days in writing', '3 days for an extraordinary meeting'] })),
  q('enzh-direct-03', 'direct', 'p-uk-staff', 'Who has to approve using the group company seal?', ez({ a: [['G-ADM-012', 'approval']], pts: ['the head of the department handling it and the head of the General Office', 'the CEO as well for commitments or guarantees in the group name'] })),
  q('enzh-direct-04', 'direct', 'p-sg-mgr', 'Within how many days must findings from an internal audit report be fixed?', ez({ a: [['G-CMP-020', 'rectify']], v: ['60'], pts: ['within 60 days of receiving the report'] })),
  q('enzh-direct-05', 'direct', 'p-intl-staff', 'How often must department heads hold an integrity talk with their team?', ez({ a: [['PTY-007', '第六条']], v: [{ value: 'once', any_of: ['1', 'one'] }], pts: ['at least once a year', 'records filed with the discipline inspection office'] })),
  q('enzh-direct-06', 'direct', 'p-g-staff', 'What is the hotel limit for a business trip to Shanghai?', ez({ a: [['FIN-001', '第五条']], v: ['600'], pts: ['RMB 600 per night in first-tier cities', 'answered in English'] })),
  q('enzh-direct-07', 'direct', 'p-g-staff', 'How many hours of overtime are allowed per month?', ez({ a: [['G-HR-025', 'limit']], v: ['36'], pts: ['36 hours per month'] })),
  q('enzh-calc-01', 'calculation', 'p-g-staff', 'I used my own car for a 150 km business trip. How much is the allowance?', ez({ a: [['G-ADM-011', 'private']], v: ['180'], pts: ['150 × 1.2 = RMB 180'] })),
  q('enzh-cross-01', 'cross_reference', 'p-g-staff', 'How long are board meeting minutes kept?', ez({ a: [['G-ADM-008', '附件1']], pts: ['permanently (appendix 1 retention schedule)'] })),
  q('enzh-nobasis-01', 'no_basis', 'p-g-staff', 'How many days of marriage leave do I get?', ez({ ...NB, absent: ['婚假'], pts: ['no group policy covers marriage leave', 'answered in English'] })),
  q('enzh-para-01', 'paraphrase', 'p-g-staff', 'A supplier sent me a gift basket worth about 300 yuan. What should I do?', ez({ a: [['CMP-004', '第七条']], v: ['200', '3'], pts: ['gifts above RMB 200 must not be accepted', 'if it cannot be refused, hand it to Compliance within 3 working days'] })),
  q('enzh-unit-01', 'unit_scope', 'p-a-staff', "What's the hotel limit for a trip to Beijing?", ez({ a: [['A-FIN-010', 'lodging']], v: ['500'], pts: ["under Company A's own policy, RMB 500 per night"] })),
  q('enzh-rank-01', 'rank_tier', 'p-c-staff', "What's my hotel limit in Shenzhen?", ez({ a: [['C-FIN-010', 'lodging']], v: ['450'], clarify: true, pts: ['caps by grade; ask the grade', 'staff: RMB 450 per night'] })),
  q('enzh-perm-draft-01', 'permission', 'p-g-staff', 'How much is the monthly phone allowance for regular staff?', ez({ perm: 'draft', a: [['G-HR-011', 'phone']], v: ['100'], forbid: [fv('160', 'the draft revision, not in force')], pts: ['RMB 100 per month'] })),
];

const zhEn: Question[] = [
  q('zhen-direct-01', 'direct', 'p-sg-staff', '看门诊每次最多能报销多少？', ze({ a: [['SG-BEN-003', 'outpatient']], v: ['50'], pts: ['每次最多 50 新元', '用中文作答'] })),
  q('zhen-direct-02', 'direct', 'p-sg-staff', '看牙一年能报多少钱？', ze({ a: [['SG-BEN-003', 'dental']], v: ['300'], pts: ['每年最多 300 新元'] })),
  q('zhen-direct-03', 'direct', 'p-sg-staff', '我孩子 5 岁，有育儿假吗？几天？', ze({ a: [['SG-HR-002', 'childcare']], v: ['6'], pts: ['孩子未满 7 岁，每年 6 天带薪育儿假'] })),
  q('zhen-direct-04', 'direct', 'p-uk-staff', '病假几天以内可以自己证明？', ze({ a: [['UK-HR-002', 'sick']], v: ['7'], pts: ['7 个自然日以内可自行证明', '更长须医生开具证明'] })),
  q('zhen-direct-05', 'direct', 'p-intl-staff', '收到的礼品超过多少美元要登记？几天内登记？', ze({ a: [['INTL-CMP-004', 'limit']], v: ['100', '5'], pts: ['超过 100 美元', '5 个工作日内登记并交合规部门'] })),
  q('zhen-unit-01', 'unit_scope', 'p-uk-staff', '去伦敦出差住宿上限是多少？', ze({ a: [['UK-TRV-001', 'hotel']], v: ['200'], forbid: [fv('250', 'the overseas group cap; the UK company has its own', '美元')], pts: ['伦敦每晚 200 英镑'] })),
  q('zhen-unit-02', 'unit_scope', 'p-sg-staff', '出差报销要在几天内提交？', ze({ a: [['SG-TRV-001', 'claims']], v: ['21'], pts: ['返回后 21 天内提交'] })),
  q('zhen-calc-01', 'calculation', 'p-sg-staff', '我 45 岁，体检加看牙一年最多能报多少？', ze({ a: [['SG-BEN-003', 'screening'], ['SG-BEN-003', 'dental']], v: ['550'], pts: ['体检 250 + 牙科 300 = 550 新元'] })),
  q('zhen-rank-01', 'rank_tier', 'p-sg-mgr', '去东京出差，酒店每晚上限多少？', ze({ a: [['SG-TRV-001', 'hotel']], v: ['280'], clarify: true, pts: ['按职级分档，请说明职级', '经理东京（一类城市）每晚 280 美元'] })),
  q('zhen-cross-01', 'cross_reference', 'p-uk-staff', '远程办公的核心工作时间是几点到几点？', ze({ a: [['UK-HR-010', 'other'], ['INTL-HR-005', 'core']], v: ['10:00', '16:00'], pts: ['英国公司按海外总部远程办公政策执行', '当地时间 10:00 至 16:00'] })),
  q('zhen-nobasis-01', 'no_basis', 'p-sg-staff', '公司报销健身房会员费吗？', ze({ ...NB, absent: ['gym', '健身'], pts: ['未找到相关规定', '用中文作答'] })),
  q('zhen-perm-abolished-01', 'permission', 'p-intl-staff', '远程办公的话，公司给多少钱买办公设备？', ze({ perm: 'abolished', a: [['INTL-HR-005', 'equipment']], v: ['300'], forbid: [fv('500', 'the abolished 2024 policy', 'USD'), fv('500', 'the abolished 2024 policy', '美元')], pts: ['试用期满后一次性 300 美元'] })),
  q('zhen-perm-restricted-01', 'permission', 'p-sg-staff', '执行董事的长期激励几年归属？', ze({ perm: 'restricted', ...NB, forbid: [fv('3', 'restricted to executive directors and the Remuneration Committee', '归属'), fv('3', 'restricted to executive directors and the Remuneration Committee', 'vest')], pts: ['不披露限定范围制度的内容'] })),
  q('zhen-pinned-01', 'pinned', 'p-uk-staff', '这份制度里私车里程怎么报销？', ze({ pin: 'UK-TRV-001', a: [['UK-TRV-001', 'mileage']], v: ['0.40', '0.20', { value: '10,000', any_of: ['10000', '1 万'] }], pts: ['每个纳税年度前 10,000 英里每英里 0.40 英镑，之后每英里 0.20 英镑'] })),
];

export const EN_QUESTIONS: Question[] = [...enEn, ...enZh, ...zhEn];
