import * as UI from '@objectstack/spec/ui';
import { PolicySuggestion } from '../objects/policy-suggestion.object.js';

// The policy administrators' queue of AI suggestions (brightrule#48). The list
// leaves out the excerpt and the proposed wording: a grid cell is no place to
// read them. The second list is the work still to do: 待处理 and 讨论中.
const policySuggestionViews: UI.View = {
  object: PolicySuggestion.name,
  list: {
    label: '全部建议',
    type: 'grid',
    columns: [
      { field: 'suggestion_no' },
      { field: 'policy' },
      { field: 'category' },
      { field: 'severity' },
      { field: 'article' },
      { field: 'finding' },
      { field: 'related_policy' },
      { field: 'status' },
      { field: 'diagnosed_at' },
    ],
    sort: [{ field: 'diagnosed_at', order: 'desc' }],
  },
  listViews: {
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
        { field: 'diagnosed_at' },
      ],
      filter: [{ field: 'status', operator: 'in', value: ['open', 'discussing'] }],
      sort: [{ field: 'diagnosed_at', order: 'desc' }],
    },
  },
};

export default policySuggestionViews;
