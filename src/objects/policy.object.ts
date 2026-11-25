import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度主表 — one row per policy. Its text lives on its versions' documents
 * (`brightrule_policy_document.body_md_redacted`); the descriptions below are
 * what an AI client reads through `describe_object`, so they say where.
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
    '制度目录（每份制度一行，不含正文）。正文全文在版本文档 brightrule_policy_document：条件 policy = 本制度 id、is_current = true，读字段 body_md_redacted。员工可问的只有 status = published 的制度',

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
      description: '按制度体系的分类；导入时取自制度信息表的「制度类别」',
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
      description: '一两句话说明本制度管什么，供按目录挑选制度；可能为空，为空不代表没有正文',
    }),
    status: Field.select({
      label: '状态',
      group: 'effect',
      description: 'published = 已发布，可据以作答；draft = 草稿，尚无现行版本；revising = 修订中；abolished = 已废止，不再有效',
      options: [
        { label: '草稿', value: 'draft', color: '#6B7280', default: true },
        { label: '已发布', value: 'published', color: '#10B981' },
        { label: '修订中', value: 'revising', color: '#F59E0B' },
        { label: '已废止', value: 'abolished', color: '#EF4444' },
      ],
    }),
    current_version: Field.text({
      label: '现行版本',
      maxLength: 20,
      group: 'effect',
      description: '现行版本的版本号（文号），引用出处时写在制度名之后，如《某制度》本司集办﹝2022﹞17号 第五条',
    }),
    effective_date: Field.date({ label: '生效日期', group: 'effect' }),
    next_review_date: Field.date({ label: '下次复审日', group: 'effect' }),
  },
});
