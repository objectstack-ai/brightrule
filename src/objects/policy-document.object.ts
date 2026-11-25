import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 版本文档 — one file of a policy version: the body (正文) or one attachment
 * (附件). A version has exactly one body row and one row per attachment
 * (brightrule#22).
 *
 * The original text lives ONLY in `original_file` (the docx / PDF as issued):
 * people preview or download it. `get_record` / `query_records` return the
 * file's metadata (id, name, size, type, link), never its content. What the
 * model is meant to read is `body_md_redacted`, the redacted Markdown produced
 * offline by `tools/redact`. The original is never stored as a text field: a
 * text field a person can read is one the AI reads on their behalf.
 *
 * Caveat (measured, docs/policy-document.md): the MCP server's `read_file`
 * tool DOES return the text of a txt / PDF / docx file held by a file field to
 * any caller who can read the record. Keeping originals away from an external
 * AI client is therefore a permission question for brightrule#10, not
 * something this object's shape guarantees.
 *
 * `policy` and `is_current` are not typed by hand: the document hook fills
 * `policy` from the version, and the version hook keeps `is_current` in step
 * with the version's status (src/qa/version-current.hook.ts). Neither is
 * declared `readonly`: the platform strips a readonly field from every
 * non-system write, and the hooks' own writes are not system writes. Who may
 * edit them is the permission sets' job (brightrule#10), as for the clause.
 */
export const PolicyDocument = ObjectSchema.create({
  name: 'brightrule_policy_document',
  sharingModel: 'controlled_by_parent',
  label: '版本文档',
  pluralLabel: '版本文档',
  icon: 'file-text',
  nameField: 'title',
  description: '制度版本的正文与附件：原件文件（员工看）与脱敏正文（AI 读）',

  // Quick search matches the title only: the redacted body is long, and a
  // type-default search would scan it on every keystroke.
  searchableFields: ['title'],

  fieldGroups: [
    { key: 'basic', label: '文档' },
    { key: 'content', label: '内容' },
    { key: 'import', label: '导入信息' },
  ],

  fields: {
    title: Field.text({ label: '标题', required: true, maxLength: 200, group: 'basic' }),
    policy_version: Field.masterDetail('brightrule_policy_version', {
      label: '所属版本',
      required: true,
      group: 'basic',
      deleteBehavior: 'cascade',
    }),
    policy: Field.lookup('brightrule_policy', {
      label: '所属制度',
      group: 'basic',
      description: '由所属版本自动带出',
    }),
    doc_kind: Field.select({
      label: '类型',
      required: true,
      group: 'basic',
      options: [
        { label: '正文', value: 'body', default: true },
        { label: '附件', value: 'attachment' },
      ],
    }),
    attachment_class: Field.select({
      label: '附件类别',
      group: 'basic',
      requiredWhen: "record.doc_kind == 'attachment'",
      description: '规范性附件并入全文交给 AI；表单与仅原件的附件不发给 AI',
      options: [
        { label: '规范性（并入全文）', value: 'normative' },
        { label: '表单（交给用户）', value: 'form' },
        { label: '仅原件（无文本）', value: 'original' },
      ],
    }),
    sort_no: Field.number({ label: '序号', scale: 0, min: 0, group: 'basic', description: '正文为 0，附件依次为 1、2…' }),
    is_current: Field.boolean({ label: '现行', defaultValue: false, group: 'basic', description: '随所属版本的状态自动维护' }),

    original_file: Field.file({ label: '原件（docx / PDF）', group: 'content' }),
    body_md_redacted: Field.markdown({
      label: '脱敏正文',
      group: 'content',
      requiredWhen: "record.doc_kind == 'body' || record.attachment_class == 'normative'",
      description: 'AI 读取的唯一正文来源；由 tools/redact 离线脱敏生成',
    }),
    article_index: Field.json({
      label: '条号索引',
      group: 'content',
      description: '每一条：{ article, chapter, redacted: [起, 止] }，偏移按脱敏正文的字符计',
    }),

    has_text: Field.boolean({ label: '有文本', defaultValue: false, group: 'import' }),
    text_chars: Field.number({ label: '字数（脱敏文）', scale: 0, min: 0, group: 'import' }),
    text_tokens: Field.number({ label: 'Token 估算', scale: 0, min: 0, group: 'import' }),
    content_hash: Field.text({
      label: '内容哈希',
      maxLength: 64,
      group: 'import',
      description: '原件文件字节的 SHA-256（十六进制），导入去重用',
    }),
  },
});
