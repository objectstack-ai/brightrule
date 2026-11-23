import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 问询记录 — a question an employee asks. Saving a question with no answer
 * runs `src/qa/question-answer.hook.ts`: it retrieves the current clauses the
 * asker may read, answers from the best one with its citation, and routes the
 * question to a person when nothing matches.
 */
export const Question = ObjectSchema.create({
  name: 'brightrule_question',
  sharingModel: 'public_read_write',
  label: '制度问询',
  pluralLabel: '制度问询',
  icon: 'message-circle-question',
  nameField: 'question',
  description: '员工就制度提出的问题；AI 依据现行条款答复并注明出处，答不上的转人工',

  fieldGroups: [
    { key: 'question', label: '问题' },
    { key: 'answer', label: '答复' },
  ],

  fields: {
    question: Field.text({ label: '问题', required: true, searchable: true, maxLength: 500, group: 'question' }),
    status: Field.select({
      label: '处理状态',
      group: 'question',
      options: [
        { label: '待答复', value: 'open', color: '#F59E0B', default: true },
        { label: '已答复', value: 'answered', color: '#10B981' },
        { label: '已关闭', value: 'closed', color: '#6B7280' },
      ],
    }),
    answer: Field.textarea({ label: '答复', group: 'answer' }),
    cited_clause: Field.lookup('brightrule_clause', { label: '引用条款', group: 'answer' }),
    other_references: Field.textarea({ label: '其他相关条款', group: 'answer' }),
    answer_source: Field.select({
      label: '答复来源',
      group: 'answer',
      options: [
        { label: 'AI 检索', value: 'ai' },
        { label: '人工', value: 'human' },
      ],
    }),
    match_score: Field.number({ label: '匹配度', precision: 2, group: 'answer' }),
    needs_human: Field.boolean({ label: '需转人工', defaultValue: false, group: 'answer' }),
  },
});
