import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度主表 — one row per policy. Its text lives on its versions and clauses.
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
  description: '制度主表：编号、分类、发文单位、归口部门、状态、现行版本与复审安排',

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
      options: [
        { label: '行政', value: 'admin' },
        { label: '人事', value: 'hr' },
        { label: '财务', value: 'finance' },
        { label: '信息技术', value: 'it' },
        { label: '合规', value: 'compliance' },
      ],
    }),
    issuing_unit: Field.text({ label: '发文单位', maxLength: 100, group: 'basic' }),
    department: Field.text({ label: '归口部门', maxLength: 100, group: 'basic' }),
    summary: Field.textarea({ label: '目录摘要', group: 'basic' }),
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
    current_version: Field.text({ label: '现行版本', maxLength: 20, group: 'effect' }),
    effective_date: Field.date({ label: '生效日期', group: 'effect' }),
    next_review_date: Field.date({ label: '下次复审日', group: 'effect' }),
  },
});
