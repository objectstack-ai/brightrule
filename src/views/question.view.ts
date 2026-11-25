import * as UI from '@objectstack/spec/ui';
import { Question } from '../objects/question.object.js';

// List columns stay short: the redacted answer, the basis and the run record
// (Markdown / JSON) are read on the record page, never in a grid cell.
const questionViews: UI.View = {
  object: Question.name,
  list: {
    label: '全部问询',
    type: 'grid',
    columns: [
      { field: 'question' },
      { field: 'scope_kind' },
      { field: 'scope_policy' },
      { field: 'status' },
      { field: 'answer' },
      { field: 'cited_clause' },
      { field: 'match_score' },
      { field: 'answer_source' },
      { field: 'answer_route' },
    ],
    sort: [{ field: 'created_at', order: 'desc' }],
  },
  listViews: {
    needs_human: {
      label: '待人工答复',
      type: 'grid',
      columns: [
        { field: 'question' },
        { field: 'scope_policy' },
        { field: 'answer' },
        { field: 'match_score' },
        { field: 'created_at' },
      ],
      filter: [{ field: 'needs_human', operator: 'equals', value: true }],
    },
  },
};

export default questionViews;
