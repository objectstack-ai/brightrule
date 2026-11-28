import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度条款 — a retrieval unit derived from a policy's body or one of its
 * attachments: one article (第X条), one numbered section of a manual, or one
 * table (a large table split into row groups, each repeating its header).
 *
 * Derived, never edited: a program writes these rows from `body_md` /
 * attachment `body_md` whenever the policy changes; nobody maintains them and
 * no app navigation, view or tab shows them. They exist so the knowledge
 * service can index one clause per passage (the platform splitter cuts by
 * Markdown heading only), and so a clause of an attachment carries its
 * policy's unit for a unit-scoped search.
 *
 * `content` is what is embedded: a `【单位｜制度名｜附件】章 > 节 > 条` prefix plus
 * the clause text. Visibility follows the policy (controlled by parent).
 */
export const PolicyClause = ObjectSchema.create({
  name: 'brightrule_policy_clause',
  sharingModel: 'controlled_by_parent',
  label: '制度条款',
  pluralLabel: '制度条款',
  icon: 'list',
  nameField: 'title',
  description: '由制度正文和附件自动派生的检索单元（一条、一节或一张表），不对用户展示',

  fields: {
    title: Field.text({ label: '条款', maxLength: 200, description: '条号或小节编号，如「第十条」「4.6.7」「附表3」' }),
    policy: Field.masterDetail('brightrule_policy', { label: '所属制度', required: true, deleteBehavior: 'cascade' }),
    owning_unit: Field.lookup('sys_business_unit', { label: '所属单位', description: '抄自所属制度，供按单位链检索' }),
    origin: Field.select({
      label: '来源',
      options: [
        { label: '正文', value: 'body' },
        { label: '附件', value: 'attachment' },
      ],
    }),
    attachment_label: Field.text({ label: '附件编号', maxLength: 50 }),
    path: Field.text({ label: '位置', maxLength: 500, description: '章 > 节 > 条' }),
    kind: Field.select({
      label: '类型',
      options: [
        { label: '条文', value: 'article' },
        { label: '小节', value: 'section' },
        { label: '表格', value: 'table' },
        { label: '表单', value: 'form' },
      ],
    }),
    seq: Field.number({ label: '顺序', scale: 0 }),
    section_key: Field.text({ label: '所在节', maxLength: 300, description: '同一节的条款相同，取相邻条款用' }),
    clause_hash: Field.text({ label: '内容指纹', maxLength: 64, description: '同文多份的同一条款相同，检索时按它去重' }),
    content: Field.textarea({ label: '检索文本', description: '前缀「【单位｜制度名】章 > 节 > 条」加条文原文' }),
  },
});
