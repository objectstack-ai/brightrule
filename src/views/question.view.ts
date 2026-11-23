import * as UI from '@objectstack/spec/ui';
import { Question } from '../objects/question.object.js';

const questionViews: UI.View = {
  object: Question.name,
  list: {
    label: '全部问询',
    type: 'grid',
    columns: [
      { field: 'question' },
      { field: 'status' },
      { field: 'answer' },
      { field: 'cited_clause' },
      { field: 'match_score' },
      { field: 'answer_source' },
    ],
    sort: [{ field: 'created_at', order: 'desc' }],
  },
  listViews: {
    needs_human: {
      label: '待人工答复',
      type: 'grid',
      columns: [
        { field: 'question' },
        { field: 'answer' },
        { field: 'match_score' },
        { field: 'created_at' },
      ],
      filter: [{ field: 'needs_human', operator: 'equals', value: true }],
    },
  },
};

export default questionViews;
