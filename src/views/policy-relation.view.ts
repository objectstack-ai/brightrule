import * as UI from '@objectstack/spec/ui';
import { PolicyRelation } from '../objects/policy-relation.object.js';

const policyRelationViews: UI.View = {
  object: PolicyRelation.name,
  list: {
    label: '全部关系',
    type: 'grid',
    columns: [
      { field: 'from_version' },
      { field: 'relation_type' },
      { field: 'to_title' },
      { field: 'to_policy' },
      { field: 'from_articles' },
      { field: 'confirmed' },
      { field: 'source' },
    ],
  },
  listViews: {
    // The review queue: relations nobody has confirmed yet (extracted on
    // import, or entered by hand and not yet checked).
    pending: {
      label: '待确认关系',
      type: 'grid',
      columns: [
        { field: 'from_version' },
        { field: 'relation_type' },
        { field: 'to_title' },
        { field: 'to_policy' },
        { field: 'from_articles' },
        { field: 'source' },
      ],
      filter: [{ field: 'confirmed', operator: 'equals', value: false }],
    },
  },
};

export default policyRelationViews;
