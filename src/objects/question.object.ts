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
  },
});
