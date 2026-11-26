import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度附件 — one attachment (附件N / 附表N) of a policy, the policy's only
 * child (brightrule#45). The body is not here: it is the policy's own
 * `body_md` (see policy.object.ts).
 *
 * There is no attachment class: the source files do not classify their
 * attachments, and an attachment is not always a table. Its redacted Markdown
 * (`body_md`), when it has text, is read together with the policy's body.
 *
 * As for the body, the original lives ONLY in `original_file`.
 *
 * `title` is the attachment's own name as the source writes it (「本集团内训师
 * 申报表」), and `label` its own number (「附表1」). Neither repeats the policy
 * name: the master-detail link already says whose it is, and a title that
 * begins with the policy name makes a search by that name hit the attachment,
 * not the body.
 */
export const PolicyAttachment = ObjectSchema.create({
  name: 'brightrule_policy_attachment',
  sharingModel: 'controlled_by_parent',
  label: '制度附件',
  pluralLabel: '制度附件',
  icon: 'paperclip',
  nameField: 'title',
  description: '制度的附件（附件N、附表N），与正文一起读',

  // Quick search matches the title only: an attachment's text can be long.
  searchableFields: ['title'],

  fieldGroups: [
    { key: 'basic', label: '附件信息' },
    { key: 'content', label: '附件正文' },
    // 原件单独一组、默认折叠；导入工具维护的字段 hidden，不进表单
    { key: 'import', label: '原件', collapse: 'collapsed' },
  ],

  fields: {
    title: Field.text({
      label: '标题',
      required: true,
      maxLength: 200,
      group: 'basic',
      description: '原文里附件自己的名称，不带制度名',
    }),
    policy: Field.masterDetail('brightrule_policy', {
      label: '所属制度',
      required: true,
      group: 'basic',
      deleteBehavior: 'cascade',
    }),
    label: Field.text({
      label: '编号',
      maxLength: 20,
      group: 'basic',
      description: '原文里的编号，如「附件1」「附表2」',
    }),
    sort_no: Field.number({ label: '序号', scale: 0, min: 1, group: 'basic' }),

    body_md: Field.markdown({
      label: '附件正文',
      group: 'content',
      description: '附件的全文（Markdown，已脱敏）；只有图片、没有文字的附件为空',
    }),
    has_images: Field.boolean({
      label: '含图片',
      defaultValue: false,
      group: 'content',
      description: '附件里有图片、图表、SmartArt、公式或嵌入对象（AI 看不到）；导入时自动统计',
    }),
    images_need_review: Field.boolean({
      label: '图片待核对',
      defaultValue: false,
      group: 'content',
      description: '人工勾选：图片里的内容需要补录成文字或重新扫描',
    }),

    original_file: Field.file({ label: '原件（docx / PDF）', group: 'import' }),
    has_text: Field.boolean({ hidden: true, label: '有文本', defaultValue: false, group: 'import' }),
    text_chars: Field.number({ hidden: true, label: '字数', scale: 0, min: 0, group: 'import' }),
    text_tokens: Field.number({ hidden: true, label: 'Token 估算', scale: 0, min: 0, group: 'import' }),
    content_hash: Field.text({
      hidden: true,
      label: '内容哈希',
      maxLength: 64,
      group: 'import',
      description: '原件文件字节的 SHA-256（十六进制）；不传文件时为脱敏 Markdown 的 SHA-256，导入去重用',
    }),
  },
});
