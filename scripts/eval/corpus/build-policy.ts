/**
 * Turn a policy definition (its facts as articles) into a corpus policy with a
 * body, the way the app stores one: `assembleBody` from src/data — the same
 * Markdown and article index as the dev seed and the import tool.
 */
import { assembleBody, type BodyArticle } from '../../../src/data/document-text.js';
import type { Attachment, CorpusPolicy, Lang } from '../schema.js';

/** A fact article: an id the questions name it by, its heading, its text. */
export type Fact = [id: string, title: string, text: string];

export interface PolicyDef {
  key: string;
  title: string;
  unit: string;
  unitName: string;
  lang?: Lang;
  status?: CorpusPolicy['status'];
  category: string;
  level?: CorpusPolicy['policy_level'];
  dept: string;
  docNo?: string;
  issued: string;
  effective: string;
  summary?: string;
  issuance?: CorpusPolicy['issuance_type'];
  parent?: string;
  addressees?: string;
  restrictedTo?: string;
  /** 适用范围 (zh) / scope (en) text; a default is written from the unit. */
  scope?: string;
  /** What the policy is for (the first article's purpose clause). */
  purpose?: string;
  /** The title of a policy this one replaces, named in the last article. */
  supersedes?: string;
  /** false: the body is the facts only (a forwarding notice), no frame articles. */
  frame?: boolean;
  facts: Fact[];
  attachments?: Attachment[];
  origin?: CorpusPolicy['origin'];
}

const ZH_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1 → 一, 10 → 十, 12 → 十二, 20 → 二十, 35 → 三十五 (up to 99). */
export function zhNumber(n: number): string {
  if (n < 10) return ZH_DIGIT[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 1 ? '' : ZH_DIGIT[tens]}十${ones ? ZH_DIGIT[ones] : ''}`;
}

export const zhArticle = (n: number) => `第${zhNumber(n)}条`;
export const enArticle = (n: number) => `Article ${n}`;

const kindOf = (title: string) => title.match(/(办法|规定|制度|细则|规则|标准|规范)/)?.[1] ?? '制度';

/** Category → 大类, as src/qa/policy-category-group.hook.ts derives it. */
export const categoryGroup = (category: string): CorpusPolicy['category_group'] =>
  category === 'governance' ? 'governance' : category === 'party' ? 'party' : 'operations';

export interface BuiltPolicy {
  policy: CorpusPolicy;
  /** fact id → article number (第X条 / Article N). */
  articles: Record<string, string>;
}

export function buildPolicy(d: PolicyDef): BuiltPolicy {
  const lang = d.lang ?? 'zh';
  const label = lang === 'zh' ? zhArticle : enArticle;
  const rows: BodyArticle[] = [];
  const articles: Record<string, string> = {};
  let n = 0;
  const push = (title: string, text: string, id?: string) => {
    n += 1;
    rows.push({ no: label(n), title, text });
    if (id) articles[id] = label(n);
  };
  const frame = d.frame ?? true;
  if (frame && lang === 'zh') {
    const kind = kindOf(d.title);
    const topic = d.title.replace(/（.*?）/g, '').replace(/(管理)?(办法|规定|制度|细则|规则|标准|规范)$/, '');
    push('目的', `为规范${d.purpose ?? `${topic}管理`}，明确工作要求，根据国家有关规定，结合${d.unitName}实际，制定本${kind}。`, 'purpose');
    push('适用范围', d.scope ?? `本${kind}适用于${d.unitName}全体员工。`, 'scope');
  } else if (frame) {
    const unit = d.unitName.replace(/\.$/, '');
    push('Purpose', `This policy sets out ${d.purpose ?? 'the rules on its subject'} for ${unit}.`, 'purpose');
    push('Scope', d.scope ?? `This policy applies to all employees of ${unit}.`, 'scope');
  }
  for (const [id, title, text] of d.facts) push(title, text, id);
  if (frame && lang === 'zh') {
    const kind = kindOf(d.title);
    const replaced = d.supersedes ? `原《${d.supersedes}》同时废止。` : '';
    push('附则', `本${kind}由${d.dept}负责解释，自 ${zhDate(d.effective)}起施行。${replaced}`, 'closing');
  } else if (frame) {
    const replaced = d.supersedes ? ` It replaces the ${d.supersedes}.` : '';
    push('Interpretation and effective date', `${d.dept} is responsible for interpreting this policy, which takes effect on ${d.effective}.${replaced}`, 'closing');
  }
  const { markdown, articleIndex } = assembleBody(d.title, rows);
  return {
    articles,
    policy: {
      key: d.key,
      title: d.title,
      unit: d.unit,
      lang,
      status: d.status ?? 'published',
      issuance_type: d.issuance ?? 'issue',
      ...(d.parent ? { parent: d.parent } : {}),
      ...(d.docNo ? { doc_no: d.docNo } : {}),
      issuing_unit: d.unitName,
      category: d.category,
      category_group: categoryGroup(d.category),
      ...(d.level ? { policy_level: d.level } : {}),
      department: d.dept,
      ...(d.addressees ? { addressees: d.addressees } : {}),
      issued_date: d.issued,
      effective_date: d.effective,
      ...(d.summary ? { summary: d.summary } : {}),
      is_trial: /试行|暂行|\(Trial\)/i.test(d.title),
      ...(d.restrictedTo ? { restricted_to: d.restrictedTo } : {}),
      body_md: markdown,
      article_index: articleIndex,
      attachments: d.attachments ?? [],
      origin: d.origin ?? 'core',
    },
  };
}

/** 2026-07-01 → 2026 年 7 月 1 日 */
export function zhDate(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number);
  return `${y} 年 ${m} 月 ${day} 日`;
}
