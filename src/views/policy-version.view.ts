import * as UI from '@objectstack/spec/ui';
import { PolicyVersion } from '../objects/policy-version.object.js';

const policyVersionViews: UI.View = {
  object: PolicyVersion.name,
  // 新建 / 编辑表单只放人填的字段，两两成对排齐，正文紧接在后面。条号索引、字数、token 估算、内容哈希由
  // 导入工具（tools/redact）维护，不在表单里。正文原件现阶段不上传，字段留给后期，单独一组、默认折叠。
  // 对象字段的 description 写给 AI，表单里用 helpText 覆盖成给人看的短句（不需要提示的字段给空串）。
  form: {
    type: 'simple',
    modalSize: 'xl',
    sections: [
      {
        name: 'version_main',
        label: '版本信息',
        columns: 2,
        fields: [
          'policy',
          { field: 'version_no', helpText: '' },
          { field: 'title', span: 'full', helpText: '' },
          { field: 'effective_date', helpText: '' },
          { field: 'version_status', helpText: '' },
          { field: 'change_note', span: 'full', helpText: '' },
          { field: 'body_md', span: 'full', helpText: '脱敏后的正文（Markdown）：条文以 **第X条** 开头，章节用 ## 标题' },
        ],
      },
      {
        name: 'version_original',
        label: '原件（后期使用）',
        columns: 1,
        collapsible: true,
        collapsed: true,
        fields: [{ field: 'original_file', helpText: '' }],
      },
    ],
  },
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
        { field: 'text_chars' },
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
