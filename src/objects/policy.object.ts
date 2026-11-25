import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度主表 — one row per policy. Its text is the body of its current version
 * (`current_version` → `brightrule_policy_version.body_md`); the descriptions
 * below are what an AI client reads through `describe_object`, so they say
 * where.
 *
 * Named `brightrule_policy`, never bare `policy`: on this platform *policy*
 * means a permission / security policy (AGENTS.md).
 */
export const Policy = ObjectSchema.create({
  name: 'brightrule_policy',
  // Reference data: every member reads a policy, its owner maintains it.
  // Issuing-unit visibility (group-wide vs one subsidiary) is a sharing-rule
  // layer on top of this, per docs/solution.md §08 — not built yet.
  sharingModel: 'public_read',
  label: '制度',
  pluralLabel: '制度',
  icon: 'book-open',
  nameField: 'title',
  description:
    '制度目录（每份制度一行，不含正文）。正文在现行版本上：current_version 指向现行的 brightrule_policy_version 记录，读它的 body_md。员工可问的只有 status = published 的制度',

  fieldGroups: [
    { key: 'basic', label: '基本信息' },
    { key: 'effect', label: '效力' },
  ],

  fields: {
    title: Field.text({ label: '制度名称', required: true, searchable: true, maxLength: 200, group: 'basic' }),
    policy_no: Field.text({ label: '制度编号', maxLength: 50, group: 'basic' }),
    category: Field.select({
      label: '制度分类',
      group: 'basic',
      // The values of the first five predate this list and stay as they were
      // (seed data and stored records use them); only their labels moved to the
      // policy system's own wording.
      options: [
        { label: '公司治理类', value: 'governance' },
        { label: '战略投资类', value: 'strategy' },
        { label: '经营管理类', value: 'operations' },
        { label: '人力资源管理类', value: 'hr' },
        { label: '财务管理类', value: 'finance' },
        { label: '资产管理类', value: 'asset' },
        { label: '审计合规类', value: 'compliance' },
        { label: '安全环保监管类', value: 'safety' },
        { label: '科技与工程管理类', value: 'tech' },
        { label: '数字化管理类', value: 'it' },
        { label: '党工纪类', value: 'party' },
        { label: '综合行政类', value: 'admin' },
      ],
    }),
    issuing_unit: Field.text({ label: '发文单位', maxLength: 100, group: 'basic' }),
    department: Field.text({ label: '归口部门', maxLength: 100, group: 'basic' }),
    summary: Field.textarea({
      label: '目录摘要',
      group: 'basic',
      description: '一两句话说明本制度管什么',
    }),
    status: Field.select({
      label: '状态',
      group: 'effect',
      options: [
        { label: '草稿', value: 'draft', color: '#6B7280', default: true },
        { label: '已发布', value: 'published', color: '#10B981' },
        { label: '修订中', value: 'revising', color: '#F59E0B' },
        { label: '已废止', value: 'abolished', color: '#EF4444' },
      ],
    }),
    // 版本设为现行时由 src/qa/version-current.hook.ts 自动填写，不在表单里手填（hidden 只影响界面，接口照常读写）。
    // AI 怎么用它读正文，写在 src/skills/policy-inquiry.skill.ts。
    current_version: Field.lookup('brightrule_policy_version', {
      label: '现行版本',
      group: 'effect',
      hidden: true,
    }),
    effective_date: Field.date({ label: '生效日期', group: 'effect' }),
    next_review_date: Field.date({ label: '下次复审日', group: 'effect' }),
  },
});
