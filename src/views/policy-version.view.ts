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
      // 勾选多条后「设为现行」：逐条改版本状态，版本联动钩子（src/qa/version-current.hook.ts）
      // 随之把附件设为现行、替换同一制度原来的现行版本、草稿制度改为已发布。
      bulkActionDefs: [
        {
          name: 'brightrule_version_set_current',
          label: '设为现行',
          operation: 'update',
          patch: { version_status: 'current' },
          visible: "record.version_status == 'draft'",
          confirmText:
            '将 {{ count }} 个版本设为现行：员工随即能看到、问到；同一制度原来的现行版本会改为已失效。请确认已核对正文和附件。',
          confirmLabel: '设为现行',
        },
      ],
    },
  },
};

export default policyVersionViews;
