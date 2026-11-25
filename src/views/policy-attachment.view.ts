import * as UI from '@objectstack/spec/ui';
import { PolicyAttachment } from '../objects/policy-attachment.object.js';

// The list leaves out the attachment text: a grid cell is no place to read it,
// and loading it for every row costs the page.
const policyAttachmentViews: UI.View = {
  object: PolicyAttachment.name,
  // 表单只放人填的字段，两两成对排齐，附件正文紧接在后面；所属制度、现行由所属版本自动带出，字数、token、
  // 哈希由导入工具维护。原件现阶段不上传，字段留给后期，单独一组、默认折叠。helpText 覆盖写给 AI 的说明。
  form: {
    type: 'simple',
    modalSize: 'xl',
    sections: [
      {
        name: 'attachment_main',
        label: '附件信息',
        columns: 2,
        fields: [
          { field: 'policy_version', span: 'full', helpText: '' },
          { field: 'label', helpText: '原文里的编号，如「附件1」' },
          { field: 'sort_no', helpText: '' },
          { field: 'title', helpText: '' },
          { field: 'attachment_class', helpText: '' },
          { field: 'body_md', span: 'full', helpText: '规范性附件的全文（Markdown，已脱敏）；表单类可以不填' },
        ],
      },
      {
        name: 'attachment_original',
        label: '原件（后期使用）',
        columns: 1,
        collapsible: true,
        collapsed: true,
        fields: [{ field: 'original_file', helpText: '' }],
      },
    ],
  },
  list: {
    label: '全部附件',
    type: 'grid',
    columns: [
      { field: 'label' },
      { field: 'title' },
      { field: 'policy_version' },
      { field: 'attachment_class' },
      { field: 'sort_no' },
      { field: 'is_current' },
      { field: 'has_text' },
      { field: 'text_chars' },
    ],
    sort: [{ field: 'sort_no', order: 'asc' }],
  },
};

export default policyAttachmentViews;
