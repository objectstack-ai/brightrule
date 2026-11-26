import { P } from '@objectstack/spec';
import { ObjectSchema, Field } from '@objectstack/spec/data';

// The answer fields are filled by the inquiry (AI or the policy office), never
// typed by the person asking: the create form shows only the question.
const afterCreate = P`has(record.id)`;

/**
 * 问询记录 — a question an employee asks. Employees normally ask in the ObjectOS
 * chat (src/skills/policy-inquiry.skill.ts); this object keeps the questions
 * the chat hands to a person (action_brightrule_escalate_question) and those
 * asked through a form. Saving a question with no answer
 * runs `src/qa/question-answer.hook.ts`: it retrieves the current clauses the
 * asker may read, answers from the best one with its citation, and routes the
 * question to a person when nothing matches.
 *
 * Scope, basis and run record (brightrule#27, docs/question-scope.md):
 *   - `scope_policy` names the policy the question is about; the scope hook
 *     (src/qa/question-scope.hook.ts) refuses a policy that is not published
 *     and derives `scope_kind` (there are no versions since brightrule#45);
 *   - `answer_redacted`, `basis`, `basis_md`, `answer_route` and `run_info`
 *     hold what the model answered, on what, and how. Like the older answer
 *     fields they are written by the system or the in-product AI, never by
 *     the person asking: the answer guard (src/qa/question-guard.hook.ts)
 *     strips them from a person's own write.
 *
 * Private: the person asking sees only their own questions. Who else may read
 * them (the policy office) is the permission sets' job (brightrule#10).
 * None of the hook-maintained fields is `readonly`: the platform strips a
 * readonly field from every non-system write, which would also strip the
 * in-product AI's write on the person's behalf.
 */
export const Question = ObjectSchema.create({
  name: 'brightrule_question',
  sharingModel: 'private',
  label: '制度问询',
  pluralLabel: '制度问询',
  icon: 'message-circle-question',
  nameField: 'question',
  description: '员工就制度提出的问题；AI 依据已发布制度答复并注明出处，答不上的转人工',

  fieldGroups: [
    { key: 'question', label: '问题' },
    { key: 'answer', label: '答复' },
    { key: 'run', label: '运行记录' },
  ],

  fields: {
    question: Field.text({ label: '问题', required: true, searchable: true, maxLength: 500, group: 'question' }),
    scope_policy: Field.lookup('brightrule_policy', {
      label: '指定制度',
      group: 'question',
      description: '只问某一份制度时选择；只能选已发布的制度',
      lookupFilters: [{ field: 'status', operator: 'eq', value: 'published' }],
    }),
    scope_kind: Field.select({
      label: '问询范围',
      group: 'question',
      visibleWhen: afterCreate,
      description: '由指定制度自动推出',
      options: [
        { label: '通用', value: 'general', default: true },
        { label: '指定制度', value: 'policy' },
      ],
    }),
    status: Field.select({
      label: '处理状态',
      group: 'question',
      visibleWhen: afterCreate,
      options: [
        { label: '待答复', value: 'open', color: '#F59E0B', default: true },
        { label: '已答复', value: 'answered', color: '#10B981' },
        { label: '已关闭', value: 'closed', color: '#6B7280' },
      ],
    }),
    answer: Field.textarea({ label: '答复', group: 'answer', visibleWhen: afterCreate }),
    cited_clause: Field.lookup('brightrule_clause', { label: '引用条款', group: 'answer', visibleWhen: afterCreate }),
    other_references: Field.textarea({ label: '其他相关条款', group: 'answer', visibleWhen: afterCreate }),
    answer_source: Field.select({
      label: '答复来源',
      group: 'answer',
      visibleWhen: afterCreate,
      options: [
        { label: 'AI 检索', value: 'ai' },
        { label: '人工', value: 'human' },
      ],
    }),
    match_score: Field.number({ label: '匹配度', precision: 2, group: 'answer', visibleWhen: afterCreate }),
    needs_human: Field.boolean({ label: '需转人工', defaultValue: false, group: 'answer', visibleWhen: afterCreate }),
    answer_redacted: Field.markdown({
      label: '答复（脱敏）',
      group: 'answer',
      visibleWhen: afterCreate,
      description: '模型给出的答复，含代号，不还原',
    }),
    basis: Field.json({
      label: '依据（结构化）',
      group: 'answer',
      visibleWhen: afterCreate,
      description: '[{ policy, article, quote }]',
    }),
    basis_md: Field.markdown({ label: '依据', group: 'answer', visibleWhen: afterCreate }),
    answer_route: Field.select({
      label: '作答路径',
      group: 'answer',
      visibleWhen: afterCreate,
      options: [
        { label: '整份', value: 'whole' },
        { label: '检索', value: 'search' },
        { label: '兜底', value: 'fallback' },
      ],
    }),
    run_info: Field.json({
      label: '运行记录',
      group: 'run',
      visibleWhen: afterCreate,
      description: '模型、token、耗时、用到的制度；对话写入时记对话 id',
    }),
  },
});
