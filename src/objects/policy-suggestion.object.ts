import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * AI 建议 — one finding of an AI diagnosis of a policy (brightrule#48), the
 * policy's master-detail child beside 制度附件.
 *
 * The 「AI 诊断」 action on the policy page (src/actions/diagnose-policy.action.ts)
 * is to write these rows; for now it only answers 「AI 诊断功能开发中」, so the
 * rows come from the seed or are written by hand. A policy administrator works
 * each one through 处理状态 and discusses it in the record's own comments
 * (with @ mentions) — there is no discussion field.
 *
 * Only policy administrators see suggestions: the object grants nothing to
 * anyone by itself, and only `brightrule_policy_admin` (src/security) grants
 * it. `controlled_by_parent` keeps the parent's sharing in force on top of that
 * grant, so an administrator restricted to some policies later (#10) sees only
 * their suggestions. The default inquirer set grants nothing on it.
 *
 * `category` is a DRAFT list: the diagnosis dimensions await business review.
 * `quote` is taken from the redacted body (`body_md`), never the original.
 */
export const PolicySuggestion = ObjectSchema.create({
  name: 'brightrule_policy_suggestion',
  sharingModel: 'controlled_by_parent',
  label: 'AI 建议',
  pluralLabel: 'AI 建议',
  icon: 'sparkles',
  nameField: 'suggestion_no',
  description: 'AI 诊断制度时提出的建议：问题类别、涉及条款、意见和建议改法，由制度管理员处理',

  // Record comments (and @ mentions) carry the discussion; on by default, said
  // here because the design relies on it.
  enable: { feeds: true },

  searchableFields: ['finding', 'article'],

  fieldGroups: [
    { key: 'finding', label: '诊断意见' },
    { key: 'handling', label: '处理' },
    { key: 'run', label: '诊断记录', collapse: 'collapsed' },
  ],

  fields: {
    suggestion_no: Field.autonumber({ label: '编号', autonumberFormat: 'JY-{00000}', group: 'finding' }),
    policy: Field.masterDetail('brightrule_policy', {
      label: '所属制度',
      required: true,
      group: 'finding',
      deleteBehavior: 'cascade',
    }),
    category: Field.select({
      label: '类别',
      required: true,
      group: 'finding',
      description: '草案：诊断维度待业务确认',
      options: [
        { label: '表述歧义', value: 'ambiguity' },
        { label: '可执行性', value: 'enforceability' },
        { label: '条款缺失', value: 'missing_clause' },
        { label: '内部矛盾', value: 'internal_conflict' },
        { label: '与其他制度冲突', value: 'cross_policy_conflict' },
        { label: '引用已废止制度', value: 'abolished_reference' },
        { label: '合规性', value: 'compliance' },
      ],
    }),
    severity: Field.select({
      label: '严重程度',
      required: true,
      group: 'finding',
      options: [
        { label: '高', value: 'high', color: '#EF4444' },
        { label: '中', value: 'medium', color: '#F59E0B', default: true },
        { label: '低', value: 'low', color: '#6B7280' },
      ],
    }),
    article: Field.text({
      label: '涉及条款',
      maxLength: 200,
      group: 'finding',
      description: '如「第五条」「第八条、第十一条」；针对全文的建议为空',
    }),
    quote: Field.textarea({
      label: '原文摘录',
      group: 'finding',
      description: '取自脱敏正文，不取原件',
    }),
    finding: Field.textarea({ label: '意见', required: true, group: 'finding' }),
    suggestion: Field.textarea({ label: '建议改法', group: 'finding' }),
    related_policy: Field.lookup('brightrule_policy', {
      label: '相关制度',
      group: 'finding',
      description: '与其他制度冲突、引用已废止制度时，指向对方制度',
    }),

    status: Field.select({
      label: '处理状态',
      group: 'handling',
      options: [
        { label: '待处理', value: 'open', color: '#F59E0B', default: true },
        { label: '讨论中', value: 'discussing', color: '#3B82F6' },
        { label: '已采纳', value: 'accepted', color: '#10B981' },
        { label: '不采纳', value: 'rejected', color: '#6B7280' },
      ],
    }),

    batch_id: Field.text({
      label: '诊断批次',
      maxLength: 64,
      group: 'run',
      description: '同一次诊断写入的建议共用一个批次号',
    }),
    diagnosed_at: Field.datetime({ label: '诊断时间', group: 'run' }),
    run_info: Field.json({
      label: '运行记录',
      group: 'run',
      description: '模型、token、耗时、诊断的维度和正文的内容哈希',
    }),
  },
});
