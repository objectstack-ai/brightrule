import * as UI from '@objectstack/spec/ui';
import { Policy } from '../objects/policy.object.js';

const policyViews: UI.View = {
  object: Policy.name,
  list: {
    label: '全部制度',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'policy_no' },
      { field: 'category' },
      { field: 'issuing_unit' },
      { field: 'department' },
      { field: 'status' },
      { field: 'current_version' },
      { field: 'effective_date' },
    ],
    sort: [{ field: 'policy_no', order: 'asc' }],
  },
  listViews: {
    published: {
      label: '制度库（已发布）',
      type: 'grid',
      columns: [
        { field: 'title' },
        { field: 'category' },
        { field: 'issuing_unit' },
        { field: 'current_version' },
        { field: 'effective_date' },
        { field: 'next_review_date' },
        { field: 'summary' },
      ],
      filter: [{ field: 'status', operator: 'equals', value: 'published' }],
      sort: [{ field: 'effective_date', order: 'desc' }],
    },
  },
};

export default policyViews;
