import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度意见 — one opinion on a policy (brightrule#57; was 「AI 建议」, #48).
 *
 * Three sources file here: an AI diagnosis of a policy, a problem that came up
 * while an employee asked the AI about policies, and an employee's own
 * opinion (集团规范附件 1《规章制度执行意见反馈表》). The machine name stays
 * `brightrule_policy_suggestion` so no data moves.
 *
 * - **Not a child of the policy.** 所属制度 is an optional lookup: a 制度空白
 *   opinion has no policy, and an opinion outlives the policy it was on (the
 *   year-end review of 立改废 counts them).
 * - **Private.** An employee sees only the opinions they filed; 制度管理员
 *   sees and works all of them (`viewAllRecords` / `modifyAllRecords`).
 * - **An employee fills four fields**: 所属制度, 涉及条款, 意见, 建议改法. The
 *   guard hook (src/qa/policy-suggestion-intake.hook.ts) strips the rest and
 *   derives 大类, 来源 and 处理状态.
 * - A policy administrator triages (类别, 严重程度, 处理人) and works each one
 *   through 处理状态, discussing it in the record's own comments.
 *
 * `quote` is taken from the redacted body (`body_md`), never the original.
 */
export const PolicySuggestion = ObjectSchema.create({
  name: 'brightrule_policy_suggestion',
  sharingModel: 'private',
  label: '制度意见',
  pluralLabel: '制度意见',
  icon: 'message-square-warning',
  nameField: 'suggestion_no',
  description: '对制度的意见：AI 诊断、问询中暴露、员工提交，由制度管理员分诊、处理',

  // Record comments (and @ mentions) carry the discussion; on by default, said
  // here because the design relies on it.
  enable: { feeds: true },

  searchableFields: ['finding', 'article'],

  fieldGroups: [
    { key: 'finding', label: '意见' },
    { key: 'triage', label: '分诊' },
    { key: 'handling', label: '处理' },
    { key: 'run', label: '运行记录', collapse: 'collapsed' },
  ],

  fields: {
    suggestion_no: Field.autonumber({ label: '编号', autonumberFormat: 'YJ-{00000}', group: 'finding' }),
    policy: Field.lookup('brightrule_policy', {
      label: '所属制度',
      group: 'finding',
      deleteBehavior: 'set_null',
      description: '「制度空白」类意见可不填',
      // The reverse list on the policy's page.
      relatedListTitle: '制度意见',
    }),
    article: Field.text({
      label: '涉及条款',
      maxLength: 200,
      group: 'finding',
      description: '如「第五条」「第八条、第十一条」；针对全文的意见为空',
    }),
    finding: Field.textarea({ label: '意见', required: true, group: 'finding', description: '发现的问题' }),
    suggestion: Field.textarea({ label: '建议改法', group: 'finding', description: '建议解决措施' }),
    quote: Field.textarea({
      label: '原文摘录',
      group: 'finding',
      description: '取自脱敏正文，不取原件',
    }),
    related_policy: Field.lookup('brightrule_policy', {
      label: '相关制度',
      group: 'finding',
      deleteBehavior: 'set_null',
      description: '与其他制度冲突、引用已废止制度时，指向对方制度',
      // Hidden on the other policy's page (brightrule#58 review): 所属制度's
      // list is the one readers look for.
      relatedList: false,
    }),
    source: Field.select({
      label: '来源',
      group: 'finding',
      description: '由系统记录',
      options: [
        { label: 'AI 诊断', value: 'ai_diagnosis' },
        { label: '问询暴露', value: 'inquiry' },
        { label: '员工提交', value: 'employee' },
        { label: '导入校验', value: 'import_check' },
      ],
    }),
    inquiry_excerpt: Field.textarea({
      label: '问询原文',
      group: 'finding',
      description: '来源为问询暴露时：员工的提问和 AI 答复的要点',
    }),

    category_group: Field.select({
      label: '大类',
      group: 'triage',
      description: '由类别带出',
      options: [
        { label: '制度缺陷', value: 'defect' },
        { label: '匹配不上', value: 'unmatched' },
        { label: '制度信息', value: 'metadata' },
      ],
    }),
    category: Field.select({
      label: '类别',
      group: 'triage',
      description: '员工提交时不选，由分诊确定',
      options: [
        { label: '表述歧义', value: 'ambiguity' },
        { label: '可执行性', value: 'enforceability' },
        { label: '条款缺失', value: 'missing_clause' },
        { label: '内部矛盾', value: 'internal_conflict' },
        { label: '与其他制度冲突', value: 'cross_policy_conflict' },
        { label: '引用已废止制度', value: 'abolished_reference' },
        { label: '合规性', value: 'compliance' },
        { label: '内容过时', value: 'outdated' },
        { label: '制度空白', value: 'policy_gap' },
        { label: '有制度没找到', value: 'not_found' },
        { label: '制度信息有误', value: 'metadata_error' },
      ],
    }),
    severity: Field.select({
      label: '严重程度',
      group: 'triage',
      options: [
        { label: '高', value: 'high', color: '#EF4444' },
        { label: '中', value: 'medium', color: '#F59E0B' },
        { label: '低', value: 'low', color: '#6B7280' },
      ],
    }),
    triage: Field.json({
      label: 'AI 分诊结论',
      group: 'triage',
      description: '建议的类别、严重程度、理由、置信度和建议处理方',
    }),

    status: Field.select({
      label: '处理状态',
      group: 'handling',
      description: '新建时有类别的进「待处理」，没有的进「待分诊」',
      options: [
        { label: '待分诊', value: 'triage', color: '#A855F7' },
        { label: '待处理', value: 'open', color: '#F59E0B' },
        { label: '讨论中', value: 'discussing', color: '#3B82F6' },
        { label: '已采纳', value: 'accepted', color: '#10B981' },
        { label: '不采纳', value: 'rejected', color: '#6B7280' },
        { label: '重复', value: 'duplicate', color: '#9CA3AF' },
      ],
    }),
    assignee: Field.lookup('sys_user', { label: '处理人', group: 'handling' }),
    resolution: Field.textarea({
      label: '处理说明',
      group: 'handling',
      description: '采纳或不采纳的理由、如何处理',
    }),
    duplicate_of: Field.lookup('brightrule_policy_suggestion', {
      label: '重复于',
      group: 'handling',
      deleteBehavior: 'set_null',
      description: '标为「重复」时指向原意见',
    }),

    batch_id: Field.text({
      label: '诊断批次',
      maxLength: 64,
      group: 'run',
      description: '同一次诊断写入的意见共用一个批次号',
    }),
    diagnosed_at: Field.datetime({ label: '诊断时间', group: 'run' }),
    run_info: Field.json({
      label: '运行记录',
      group: 'run',
      description: '模型、token、耗时、诊断的维度和正文的内容哈希',
    }),
  },
});
