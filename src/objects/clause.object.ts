import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 条款 — the unit of management and retrieval (AGENTS.md). Its permissions
 * follow the parent policy (master-detail, controlled by parent).
 *
 * Each clause is one knowledge document (`src/qa/knowledge-source.ts`): its
 * citation, title, text and keywords are the searchable content; `is_current`
 * rides along so an answer quotes current clauses only.
 */
export const Clause = ObjectSchema.create({
  name: 'brightrule_clause',
  sharingModel: 'controlled_by_parent',
  label: '条款',
  pluralLabel: '条款',
  icon: 'list-ordered',
  nameField: 'title',
  description:
    '按条拆分的条文（旧模型，将下线）。导入的制度没有条款记录，这里查不到不代表制度没有内容；制度正文以现行版本 brightrule_policy_version 的 body_md 为准',

  fieldGroups: [{ key: 'details', label: '条款' }],

  fields: {
    title: Field.text({ label: '条款标题', required: true, maxLength: 200, group: 'details' }),
    policy: Field.masterDetail('brightrule_policy', { label: '所属制度', required: true, group: 'details', deleteBehavior: 'restrict' }),
    policy_version: Field.lookup('brightrule_policy_version', { label: '所属版本', required: true, group: 'details' }),
    citation: Field.text({
      label: '引用出处',
      maxLength: 200,
      group: 'details',
      description: '答复里写给提问人的出处，例如《差旅费报销管理办法》V3.0 第五条',
    }),
    content: Field.textarea({ label: '条文正文', required: true, group: 'details' }),
    keywords: Field.text({ label: '关键词', maxLength: 200, group: 'details' }),
    is_current: Field.boolean({ label: '现行有效', defaultValue: false, group: 'details' }),
  },
});
