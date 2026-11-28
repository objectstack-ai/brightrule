/**
 * The synthetic unit tree and the persona accounts of the evaluation corpus.
 *
 * Every name is invented and starts with 示例 / Example (this repository is
 * public). The first three units are the app's dev seed units (same codes), so
 * the seed's ten policies keep their owners.
 *
 *   示例集团 DEMO-GROUP
 *   ├─ 示例甲公司 DEMO-A
 *   │  └─ 示例甲公司华东分公司 DEMO-A-EAST
 *   ├─ 示例乙公司 DEMO-B
 *   ├─ 示例丙公司 DEMO-C
 *   ├─ Example International Ltd. 示例国际 DEMO-INTL   (English handbooks)
 *   │  ├─ Example UK Ltd. DEMO-UK
 *   │  └─ Example Singapore Pte. Ltd. DEMO-SG
 *   └─ 40 distractor companies DEMO-Dnn (no persona; crowd the catalog)
 */
import type { Persona, Unit } from '../schema.js';

export const G = 'DEMO-GROUP';
export const A = 'DEMO-A';
export const AE = 'DEMO-A-EAST';
export const B = 'DEMO-B';
export const C = 'DEMO-C';
export const INTL = 'DEMO-INTL';
export const UK = 'DEMO-UK';
export const SG = 'DEMO-SG';

export const UNIT_NAME: Record<string, string> = {
  [G]: '示例集团',
  [A]: '示例甲公司',
  [AE]: '示例甲公司华东分公司',
  [B]: '示例乙公司',
  [C]: '示例丙公司',
  [INTL]: 'Example International Ltd.',
  [UK]: 'Example UK Ltd.',
  [SG]: 'Example Singapore Pte. Ltd.',
};

export const CORE_UNITS: Unit[] = [
  { code: G, name: UNIT_NAME[G], kind: 'company', distractor: false },
  { code: A, name: UNIT_NAME[A], parent: G, kind: 'company', distractor: false },
  { code: AE, name: UNIT_NAME[AE], parent: A, kind: 'company', distractor: false },
  { code: B, name: UNIT_NAME[B], parent: G, kind: 'company', distractor: false },
  { code: C, name: UNIT_NAME[C], parent: G, kind: 'company', distractor: false },
  { code: INTL, name: UNIT_NAME[INTL], parent: G, kind: 'company', distractor: false },
  { code: UK, name: UNIT_NAME[UK], parent: INTL, kind: 'company', distractor: false },
  { code: SG, name: UNIT_NAME[SG], parent: INTL, kind: 'company', distractor: false },
];

/** Two-character place-like syllables for the distractor companies (invented). */
const DISTRACTOR_STEMS = [
  '东岭', '西川', '南湖', '北原', '青石', '白沙', '金桥', '银滩', '松林', '柳岸',
  '云台', '星河', '海宁', '山岚', '江畔', '溪口', '石门', '泉山', '枫桥', '竹园',
  '鹿鸣', '鹤岗', '雁荡', '凤栖', '龙潭', '虎丘', '梅岭', '兰亭', '菊坡', '桂林',
  '荷塘', '杏坛', '桃源', '李庄', '杨湾', '槐里', '榆关', '桑田', '橡湖', '樟浦',
];

export const DISTRACTOR_UNITS: Unit[] = DISTRACTOR_STEMS.map((stem, i) => ({
  code: `DEMO-D${String(i + 1).padStart(2, '0')}`,
  name: `示例${stem}公司`,
  parent: G,
  kind: 'company',
  distractor: true,
}));

const mail = (id: string) => `eval+${id}@example.test`;

export const PERSONAS: Persona[] = [
  { id: 'p-g-staff', name: '评测员工·集团财务', email: mail('p-g-staff'), unit: G, department: '财务部', rank: 'staff', self_description: '我是示例集团集团机关财务部的普通员工。', lang: 'zh' },
  { id: 'p-g-mgr', name: '评测员工·集团部门负责人', email: mail('p-g-mgr'), unit: G, department: '人力资源部', rank: 'manager', self_description: '我是示例集团集团机关人力资源部的部门负责人。', lang: 'zh' },
  { id: 'p-a-staff', name: '评测员工·甲公司', email: mail('p-a-staff'), unit: A, department: '工程部', rank: 'staff', self_description: '我是示例甲公司工程部的普通员工。', lang: 'zh' },
  { id: 'p-a-mgr', name: '评测员工·甲公司中层', email: mail('p-a-mgr'), unit: A, department: '综合办公室', rank: 'manager', self_description: '我是示例甲公司综合办公室主任，属于中层管理人员。', lang: 'zh' },
  { id: 'p-ae-staff', name: '评测员工·甲公司华东', email: mail('p-ae-staff'), unit: AE, department: '项目部', rank: 'staff', self_description: '我是示例甲公司华东分公司项目部的普通员工。', lang: 'zh' },
  { id: 'p-b-staff', name: '评测员工·乙公司', email: mail('p-b-staff'), unit: B, department: '综合部', rank: 'staff', self_description: '我是示例乙公司综合部的普通员工。', lang: 'zh' },
  { id: 'p-b-mgr', name: '评测员工·乙公司中层', email: mail('p-b-mgr'), unit: B, department: '安全环保部', rank: 'manager', self_description: '我是示例乙公司安全环保部的部门负责人。', lang: 'zh' },
  { id: 'p-c-staff', name: '评测员工·丙公司', email: mail('p-c-staff'), unit: C, department: '市场部', rank: 'staff', self_description: '我是示例丙公司市场部的普通员工。', lang: 'zh' },
  { id: 'p-c-exec', name: '评测员工·丙公司高管', email: mail('p-c-exec'), unit: C, department: '公司领导', rank: 'executive', self_description: '我是示例丙公司的副总经理，属于高级管理人员。', lang: 'zh' },
  { id: 'p-nounit', name: '评测员工·未分配单位', email: mail('p-nounit'), rank: 'staff', self_description: '我是示例乙公司的普通员工。', lang: 'zh' },
  { id: 'p-uk-staff', name: 'Eval Staff UK', email: mail('p-uk-staff'), unit: UK, department: 'Operations', rank: 'staff', self_description: 'I am a staff member in the Operations team at Example UK Ltd.', lang: 'en' },
  { id: 'p-sg-staff', name: 'Eval Staff SG', email: mail('p-sg-staff'), unit: SG, department: 'Sales', rank: 'staff', self_description: 'I am a staff member in Sales at Example Singapore Pte. Ltd.', lang: 'en' },
  { id: 'p-sg-mgr', name: 'Eval Manager SG', email: mail('p-sg-mgr'), unit: SG, department: 'Finance', rank: 'manager', self_description: 'I am the Finance manager at Example Singapore Pte. Ltd.', lang: 'en' },
  { id: 'p-intl-staff', name: 'Eval Staff INTL', email: mail('p-intl-staff'), unit: INTL, department: 'HR', rank: 'staff', self_description: 'I work in HR at Example International Ltd.', lang: 'en' },
  { id: 'p-en-nounit', name: 'Eval Staff (no unit)', email: mail('p-en-nounit'), rank: 'staff', self_description: 'I work at Example Singapore Pte. Ltd.', lang: 'en' },
];

/** A unit's chain upward, itself first: what 本公司优先、再用上级 walks. */
export function unitChain(code: string | undefined, units: Unit[]): string[] {
  const out: string[] = [];
  let cur = code;
  while (cur) {
    out.push(cur);
    cur = units.find((u) => u.code === cur)?.parent;
  }
  return out;
}
