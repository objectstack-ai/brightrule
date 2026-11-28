/**
 * The English sample (Jack 2026-11-28, 「加一组英文小样」): employee-handbook
 * policies of the group's overseas arm — Example International Ltd. and its
 * two subsidiaries — with the same shapes as the Chinese core: an overseas
 * group policy and a subsidiary's own version with other numbers, a policy
 * adopted by reference, a trial, an abolished and a draft version, a
 * restricted policy, tiers by rank. Every name and number is invented.
 */
import { buildPolicy, type BuiltPolicy, type Fact, type PolicyDef } from './build-policy.js';
import { INTL, SG, UK, UNIT_NAME } from './units.js';

const inn = UNIT_NAME[INTL];
const ukn = UNIT_NAME[UK];
const sgn = UNIT_NAME[SG];

export interface EnTravelParams {
  currency: string;
  hotel: { a: number; other: number } | { staff: [number, number]; manager: [number, number] };
  perDiem: number;
  longHaulHours: number;
  claimDays: number;
}

export const enTravelFacts = (p: EnTravelParams): Fact[] => [
  ['approval', 'Pre-approval', 'All business travel must be approved in advance by the employee\'s line manager through the travel booking system.'],
  ['flights', 'Flights', `Economy class is used for flights shorter than ${p.longHaulHours} hours; premium economy may be booked for flights of ${p.longHaulHours} hours or longer.`],
  [
    'hotel',
    'Hotel limits',
    'a' in p.hotel
      ? `Hotel costs are capped at ${p.currency} ${p.hotel.a} per night in Tier A cities (London, Singapore, New York, Tokyo) and ${p.currency} ${p.hotel.other} per night elsewhere. Any amount above the cap is paid by the employee.`
      : `Hotel caps depend on grade: staff may spend up to ${p.currency} ${p.hotel.staff[0]} per night in Tier A cities (London, Singapore, New York, Tokyo) and ${p.currency} ${p.hotel.staff[1]} elsewhere; managers up to ${p.currency} ${p.hotel.manager[0]} in Tier A cities and ${p.currency} ${p.hotel.manager[1]} elsewhere. Any amount above the cap is paid by the employee.`,
  ],
  ['perdiem', 'Meal per diem', `A meal per diem of ${p.currency} ${p.perDiem} is paid for each full day away; no meal receipts are reimbursed on top of the per diem.`],
  ['claims', 'Expense claims', `Expense claims must be submitted within ${p.claimDays} days of returning from the trip. Late claims need written approval from the Finance team.`],
];

export interface EnRemoteParams {
  quota: string;
  coreHours: string;
  equipment: string;
}

export const enRemoteFacts = (p: EnRemoteParams): Fact[] => [
  ['quota', 'Remote days', `Eligible employees may work remotely ${p.quota}, agreed with their line manager.`],
  ['core', 'Core hours', `Employees working remotely must be available during core hours of ${p.coreHours} local time.`],
  ['equipment', 'Home office equipment', `A one-time home office allowance of ${p.equipment} is available after the probation period.`],
  ['security', 'Security', 'Remote work on public Wi-Fi is allowed only through the company VPN.'],
];

const DEFS: PolicyDef[] = [
  {
    key: 'INTL-TRV-001', title: 'Travel and Expense Policy', lang: 'en', unit: INTL, unitName: inn, category: 'finance', level: 'level_2', dept: 'Group Finance',
    docNo: 'EXI-FIN-2026-02', issued: '2026-02-01', effective: '2026-03-01', addressees: 'All employees of Example International Ltd. and its subsidiaries',
    summary: 'Pre-approval, flights, hotel caps, per diem and claim deadlines for business travel.',
    purpose: 'the rules for business travel and travel expenses', supersedes: 'Travel and Expense Policy (2023)',
    facts: enTravelFacts({ currency: 'USD', hotel: { a: 250, other: 180 }, perDiem: 60, longHaulHours: 6, claimDays: 30 }),
  },
  {
    key: 'INTL-TRV-001-2023', title: 'Travel and Expense Policy (2023)', lang: 'en', unit: INTL, unitName: inn, status: 'abolished', category: 'finance', level: 'level_2', dept: 'Group Finance',
    docNo: 'EXI-FIN-2023-04', issued: '2023-01-15', effective: '2023-02-01', summary: 'Replaced by the 2026 policy.',
    purpose: 'the rules for business travel and travel expenses',
    facts: enTravelFacts({ currency: 'USD', hotel: { a: 200, other: 150 }, perDiem: 45, longHaulHours: 8, claimDays: 60 }),
  },
  {
    key: 'INTL-HR-002', title: 'Leave Policy', lang: 'en', unit: INTL, unitName: inn, category: 'hr', level: 'level_2', dept: 'Group HR',
    docNo: 'EXI-HR-2026-01', issued: '2026-01-05', effective: '2026-01-15', summary: 'Annual leave, carry-over, sick leave and bereavement leave.',
    purpose: 'leave entitlements',
    facts: [
      ['annual', 'Annual leave', 'Employees receive 18 working days of paid annual leave per calendar year, pro-rated in the year they join.'],
      ['carryover', 'Carry-over', 'Up to 5 unused days may be carried over and must be taken by 31 March of the following year.'],
      ['sick', 'Sick leave', 'A medical certificate is required for sick leave of more than 2 consecutive working days.'],
      ['bereavement', 'Bereavement leave', 'Employees may take 3 days of paid bereavement leave on the death of an immediate family member.'],
    ],
  },
  {
    key: 'INTL-IT-003', title: 'Information Security Policy', lang: 'en', unit: INTL, unitName: inn, category: 'it', level: 'level_3', dept: 'Group IT',
    docNo: 'EXI-IT-2026-03', issued: '2026-04-01', effective: '2026-04-15', summary: 'Passwords, MFA, AI tools and incident reporting.',
    purpose: 'information security requirements',
    facts: [
      ['password', 'Passwords', 'Passwords must be at least 12 characters long and multi-factor authentication must be enabled on every company account.'],
      ['ai', 'AI tools', 'Confidential or restricted information must not be entered into any AI tool that the IT team has not approved.'],
      ['incident', 'Incident reporting', 'Suspected security incidents, including lost laptops or phones, must be reported to the IT Service Desk within 1 hour.'],
    ],
  },
  {
    key: 'INTL-CMP-004', title: 'Gifts and Hospitality Policy', lang: 'en', unit: INTL, unitName: inn, category: 'compliance', level: 'level_2', dept: 'Group Compliance',
    docNo: 'EXI-CMP-2026-01', issued: '2026-03-01', effective: '2026-03-15', summary: 'Gift limits, the gift register and cash gifts.',
    purpose: 'the rules on giving and receiving gifts and hospitality',
    facts: [
      ['limit', 'Gift limit', 'Employees may accept gifts worth up to USD 100. Any gift above USD 100 must be declared in the Gift Register within 5 business days and handed to Compliance.'],
      ['cash', 'Cash', 'Cash, gift cards and vouchers must never be accepted, whatever their value.'],
      ['hospitality', 'Hospitality', 'Business meals offered by a supplier are acceptable up to USD 150 per person; anything above needs prior approval from Compliance.'],
    ],
  },
  {
    key: 'INTL-HR-005', title: 'Remote Work Policy', lang: 'en', unit: INTL, unitName: inn, category: 'hr', level: 'level_3', dept: 'Group HR',
    docNo: 'EXI-HR-2026-05', issued: '2026-05-01', effective: '2026-05-15', summary: 'Remote work days, core hours and the home office allowance.',
    purpose: 'remote working arrangements', supersedes: 'Remote Work Policy (2024)',
    facts: enRemoteFacts({ quota: 'up to 2 days per week', coreHours: '10:00 to 16:00', equipment: 'USD 300' }),
  },
  {
    key: 'INTL-HR-005-2024', title: 'Remote Work Policy (2024)', lang: 'en', unit: INTL, unitName: inn, status: 'abolished', category: 'hr', level: 'level_3', dept: 'Group HR',
    docNo: 'EXI-HR-2024-02', issued: '2024-01-10', effective: '2024-02-01', summary: 'Replaced by the 2026 policy.',
    purpose: 'remote working arrangements',
    facts: enRemoteFacts({ quota: 'up to 3 days per week', coreHours: '09:30 to 15:30', equipment: 'USD 500' }),
  },
  {
    key: 'INTL-HR-006', title: 'Learning and Development Policy', lang: 'en', unit: INTL, unitName: inn, category: 'hr', level: 'level_3', dept: 'Group HR',
    docNo: 'EXI-HR-2026-06', issued: '2026-06-01', effective: '2026-06-15', summary: 'Annual learning budget and repayment if an employee leaves.',
    purpose: 'learning budgets and course funding',
    facts: [
      ['budget', 'Learning budget', 'Each employee has an annual learning budget of USD 1,500 for approved courses and certifications.'],
      ['repayment', 'Repayment', 'An employee who resigns within 6 months of completing a funded course repays 100% of its cost; one who resigns within 6 to 12 months repays 50%.'],
      ['approval', 'Approval', 'Courses costing more than USD 1,000 need approval from both the line manager and HR.'],
    ],
  },
  {
    key: 'INTL-HR-090', title: 'Executive Compensation Guidelines', lang: 'en', unit: INTL, unitName: inn, category: 'hr', level: 'level_1', dept: 'Remuneration Committee',
    docNo: 'EXI-HR-2026-90', issued: '2026-02-15', effective: '2026-03-01', addressees: 'Executive directors and the Remuneration Committee', restrictedTo: 'Executive directors and the Remuneration Committee',
    scope: 'These guidelines apply to executive directors only and are not published to other employees.',
    summary: 'Executive bonus and long-term incentive levels.', purpose: 'executive pay',
    facts: [
      ['bonus', 'Annual bonus', 'The annual bonus for executive directors is capped at 120% of base salary.'],
      ['lti', 'Long-term incentive', 'Long-term incentive awards vest over 3 years, subject to performance conditions.'],
    ],
  },
  {
    key: 'UK-HR-002', title: 'UK Leave Policy', lang: 'en', unit: UK, unitName: ukn, category: 'hr', level: 'level_2', dept: 'UK HR',
    docNo: 'EXUK-HR-2026-01', issued: '2026-01-10', effective: '2026-02-01', summary: 'Annual leave, carry-over and sickness absence in the UK.',
    purpose: 'leave entitlements in the UK',
    facts: [
      ['annual', 'Annual leave', 'Employees receive 25 days of paid annual leave per year in addition to public holidays.'],
      ['carryover', 'Carry-over', 'Up to 5 unused days may be carried over into the next leave year.'],
      ['sick', 'Sickness absence', 'Employees may self-certify sickness absence of up to 7 calendar days; longer absences need a fit note from a doctor.'],
    ],
  },
  {
    key: 'UK-TRV-001', title: 'UK Travel and Expense Policy', lang: 'en', unit: UK, unitName: ukn, category: 'finance', level: 'level_2', dept: 'UK Finance',
    docNo: 'EXUK-FIN-2026-01', issued: '2026-02-10', effective: '2026-03-01', summary: 'Hotel caps, mileage and meal allowance for UK travel.',
    purpose: 'the rules for business travel in the UK',
    facts: [
      ['hotel', 'Hotel limits', 'Hotel costs are capped at GBP 200 per night in London and GBP 130 per night elsewhere in the UK.'],
      ['mileage', 'Mileage', 'Business journeys in a private car are reimbursed at GBP 0.40 per mile for the first 10,000 miles in a tax year and GBP 0.20 per mile after that.'],
      ['meal', 'Meal allowance', 'A meal allowance of GBP 25 is paid for each overnight stay.'],
      ['other', 'Other matters', `Anything this policy does not cover follows the ${inn} Travel and Expense Policy.`],
    ],
  },
  {
    key: 'UK-HR-010', title: 'Hybrid Working Guidelines (Trial)', lang: 'en', unit: UK, unitName: ukn, category: 'hr', level: 'level_3', dept: 'UK HR',
    docNo: 'EXUK-HR-2026-04', issued: '2026-06-01', effective: '2026-07-01', summary: 'A 12-month trial: office days and remote days in the UK.',
    purpose: 'hybrid working during a 12-month trial',
    facts: [
      ['office', 'Office days', 'During the trial, employees work from the office at least 3 days per week and may work remotely on the other days.'],
      ['fridays', 'Fridays', 'Teams may agree to make Friday a remote day for everyone.'],
      ['other', 'Other matters', `Core hours, equipment and security follow the ${inn} Remote Work Policy.`],
    ],
  },
  {
    key: 'UK-HR-011-D', title: 'UK Parental Leave Policy (Draft)', lang: 'en', unit: UK, unitName: ukn, status: 'draft', category: 'hr', level: 'level_2', dept: 'UK HR',
    issued: '2026-11-01', effective: '2027-01-01', summary: 'Draft for consultation; not yet in force.',
    purpose: 'parental leave in the UK',
    facts: [
      ['maternity', 'Enhanced maternity pay', 'Employees receive full pay for the first 20 weeks of maternity leave.'],
      ['paternity', 'Paternity leave', 'Employees receive 4 weeks of paternity leave at full pay.'],
    ],
  },
  {
    key: 'UK-CMP-004', title: 'UK Anti-Bribery Procedure', lang: 'en', unit: UK, unitName: ukn, category: 'compliance', level: 'level_3', dept: 'UK Legal',
    docNo: 'EXUK-CMP-2026-02', issued: '2026-04-01', effective: '2026-04-15', summary: 'Gift limits and the gift register in the UK.',
    purpose: 'the UK procedure on gifts and bribery',
    facts: [
      ['limit', 'Gift limit', 'UK employees may accept gifts worth up to GBP 50. Gifts above GBP 50 must be recorded in the Gift Register within 10 business days.'],
      ['officials', 'Public officials', 'No gift or hospitality of any value may be offered to a public official without prior approval from UK Legal.'],
    ],
  },
  {
    key: 'SG-HR-002', title: 'Singapore Leave Policy', lang: 'en', unit: SG, unitName: sgn, category: 'hr', level: 'level_2', dept: 'SG HR',
    docNo: 'EXSG-HR-2026-01', issued: '2026-01-08', effective: '2026-02-01', summary: 'Annual leave by grade, medical leave and childcare leave in Singapore.',
    purpose: 'leave entitlements in Singapore',
    facts: [
      ['annual', 'Annual leave', 'Staff receive 14 days of paid annual leave per year; managers receive 18 days.'],
      ['medical', 'Medical leave', 'Employees may take up to 14 days of paid outpatient medical leave per year with a medical certificate.'],
      ['childcare', 'Childcare leave', 'Employees with a child under 7 receive 6 days of paid childcare leave per year.'],
    ],
  },
  {
    key: 'SG-BEN-003', title: 'Medical and Dental Benefits', lang: 'en', unit: SG, unitName: sgn, category: 'hr', level: 'level_3', dept: 'SG HR',
    docNo: 'EXSG-HR-2026-03', issued: '2026-02-01', effective: '2026-02-15', summary: 'Outpatient, dental and health screening benefits in Singapore.',
    purpose: 'medical and dental benefits in Singapore',
    facts: [
      ['outpatient', 'Outpatient visits', 'Outpatient visits to a general practitioner are reimbursed up to SGD 50 per visit.'],
      ['dental', 'Dental', 'Dental treatment is reimbursed up to SGD 300 per calendar year.'],
      ['screening', 'Health screening', 'Employees aged 40 and above receive an annual health screening worth up to SGD 250.'],
    ],
  },
  {
    key: 'SG-IT-003', title: 'Notice on Adopting the Information Security Policy', lang: 'en', unit: SG, unitName: sgn, issuance: 'reference', parent: 'INTL-IT-003', frame: false,
    category: 'it', level: 'level_3', dept: 'SG IT', docNo: 'EXSG-IT-2026-01', issued: '2026-04-20', effective: '2026-05-01',
    summary: 'Singapore adopts the overseas Information Security Policy with one local rule.',
    facts: [
      ['adopt', 'Adoption', `${sgn} adopts the ${inn} Information Security Policy.`],
      ['usb', 'Local rule: USB storage', 'In addition, USB storage devices are blocked on all Singapore laptops; exceptions need written approval from SG IT.'],
    ],
  },
  {
    key: 'SG-TRV-001', title: 'Singapore Travel Policy (Trial)', lang: 'en', unit: SG, unitName: sgn, category: 'finance', level: 'level_2', dept: 'SG Finance',
    docNo: 'EXSG-FIN-2026-02', issued: '2026-05-15', effective: '2026-06-01', summary: 'A trial travel policy with hotel caps by grade.',
    purpose: 'business travel from Singapore during a one-year trial',
    facts: enTravelFacts({ currency: 'USD', hotel: { staff: [220, 160], manager: [280, 200] }, perDiem: 55, longHaulHours: 7, claimDays: 21 }),
  },
];

export function coreEn(): BuiltPolicy[] {
  return DEFS.map(buildPolicy);
}
