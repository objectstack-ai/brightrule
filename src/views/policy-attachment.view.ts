import * as UI from '@objectstack/spec/ui';
import { PolicyAttachment } from '../objects/policy-attachment.object.js';

// The list leaves out the attachment text: a grid cell is no place to read it,
// and loading it for every row costs the page.
const policyAttachmentViews: UI.View = {
  object: PolicyAttachment.name,
  // 表单只放人填的字段：所属制度、现行由所属版本自动带出；字数、token、哈希由导入工具维护。
  // 原件现阶段不上传，字段保留给后期用，放在最后、默认折叠。helpText 是给填表的人看的短提示。
  form: {
    type: 'simple',
    sections: [
      {
        name: 'attachment_info',
        label: '附件',
        columns: 2,
        fields: [
          'policy_version',
          { field: 'label', helpText: '原文里的编号，如「附件1」' },
          { field: 'title', helpText: '附件自己的名称，不带制度名' },
          { field: 'attachment_class', helpText: '规范性附件和正文一起作为答复依据' },
          { field: 'sort_no', helpText: '先后顺序：1、2、3…' },
        ],
      },
      {
        name: 'attachment_body',
        label: '附件正文',
        columns: 1,
        fields: [{ field: 'body_md', span: 'full', helpText: '规范性附件的全文（Markdown，已脱敏）；表单类可以不填' }],
      },
      {
        name: 'attachment_original',
        label: '原件',
        columns: 1,
        collapsible: true,
        collapsed: true,
        fields: [{ field: 'original_file', helpText: '现阶段不上传' }],
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
