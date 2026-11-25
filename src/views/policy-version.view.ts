import * as UI from '@objectstack/spec/ui';
import { PolicyVersion } from '../objects/policy-version.object.js';

const policyVersionViews: UI.View = {
  object: PolicyVersion.name,
  list: {
    label: '全部版本',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'policy' },
      { field: 'version_no' },
      { field: 'version_status' },
      { field: 'effective_date' },
      { field: 'change_note' },
    ],
  },
  listViews: {
    // 导入后的草稿版本：制度管理员核对正文和附件后设为现行（tools/redact 导入只建草稿）。
    pending: {
      label: '待发布版本',
      type: 'grid',
      columns: [
        { field: 'title' },
        { field: 'policy' },
        { field: 'version_no' },
        { field: 'effective_date' },
        { field: 'change_note' },
      ],
      filter: [{ field: 'version_status', operator: 'equals', value: 'draft' }],
      sort: [{ field: 'created_at', order: 'desc' }],
    },
  },
};

export default policyVersionViews;
