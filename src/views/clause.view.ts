import * as UI from '@objectstack/spec/ui';
import { Clause } from '../objects/clause.object.js';

const clauseViews: UI.View = {
  object: Clause.name,
  list: {
    label: '全部条款',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'citation' },
      { field: 'is_current' },
      { field: 'content' },
      { field: 'keywords' },
    ],
  },
  listViews: {
    current: {
      label: '现行条款（AI 检索范围）',
      type: 'grid',
      columns: [
        { field: 'citation' },
        { field: 'title' },
        { field: 'content' },
        { field: 'keywords' },
      ],
      filter: [{ field: 'is_current', operator: 'equals', value: true }],
    },
  },
};

export default clauseViews;
