import * as UI from '@objectstack/spec/ui';
import { PolicySuggestion } from '../objects/policy-suggestion.object.js';

// 制度意见 (brightrule#57; was 「AI 建议」, #48). The object is private, so an
// employee's lists hold only their own opinions and an administrator's all of
// them. The lists leave out the excerpt and the proposed wording: a grid cell
// is no place to read them. 「待分诊」 is the administrators' intake queue;
// 「待处理 / 讨论中」 is the work still to do.
const policySuggestionViews: UI.View = {
  object: PolicySuggestion.name,
  list: {
    label: '全部意见',
    type: 'grid',
    columns: [
      { field: 'suggestion_no' },
      { field: 'policy' },
      { field: 'source' },
      { field: 'category_group' },
      { field: 'category' },
      { field: 'severity' },
      { field: 'article' },
      { field: 'finding' },
      { field: 'status' },
      { field: 'assignee' },
      { field: 'created_at' },
    ],
    sort: [{ field: 'created_at', order: 'desc' }],
  },
  listViews: {
    triage: {
      label: '待分诊',
      type: 'grid',
      columns: [
        { field: 'suggestion_no' },
        { field: 'policy' },
        { field: 'source' },
        { field: 'article' },
        { field: 'finding' },
        { field: 'created_at' },
      ],
      filter: [{ field: 'status', operator: 'equals', value: 'triage' }],
      sort: [{ field: 'created_at', order: 'asc' }],
    },
    open: {
      label: '待处理 / 讨论中',
      type: 'grid',
      columns: [
        { field: 'suggestion_no' },
        { field: 'policy' },
        { field: 'category' },
        { field: 'severity' },
        { field: 'article' },
        { field: 'finding' },
        { field: 'assignee' },
        { field: 'created_at' },
      ],
      filter: [{ field: 'status', operator: 'in', value: ['open', 'discussing'] }],
      sort: [{ field: 'created_at', order: 'desc' }],
    },
  },
};

export default policySuggestionViews;
