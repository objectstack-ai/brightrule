import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度版本 — one revision of a policy, and its text. A revision is a new
 * version; an effective version is never edited in place (AGENTS.md).
 *
 * The body (正文) is a field of the version (`body_md`): a version IS one
 * issuance, its body is its content. Attachments are the master-detail child
 * `brightrule_policy_attachment`. Before this the body was one row of a
 * 「版本文档」 object shared with the attachments, told apart by a `doc_kind`
 * field — an AI client reading the schema never connected 「版本文档」 with
 * 「正文」, and answered that the policy had no text.
 *
 * The original text lives ONLY in `original_file` (the docx / PDF as issued);
 * `body_md` is the redacted Markdown produced offline by `tools/redact`. The
 * original is never stored as a text field: a text field a person can read is
 * one the AI reads on their behalf. (The MCP server's `read_file` does return
 * the text of a file field to anyone who can read the record — keeping
 * originals from an external AI client is brightrule#10's permission question.)
 *
 * Marking a version `current` is the one maintenance act the inquiry follows:
 * `src/qa/version-current.hook.ts` makes this version's clauses and
 * attachments current, supersedes the policy's previous current version and
 * points the policy's `current_version` here.
 */
export const PolicyVersion = ObjectSchema.create({
  name: 'brightrule_policy_version',
  sharingModel: 'controlled_by_parent',
  label: '制度版本',
  pluralLabel: '制度版本',
  icon: 'git-branch',
  nameField: 'title',
  description:
    '制度的每一个版本及其正文',

  // Quick search matches the title only: the body is long, and a type-default
  // search would scan it on every keystroke.
  searchableFields: ['title'],

  fieldGroups: [
    { key: 'details', label: '版本信息' },
    { key: 'content', label: '正文' },
    // 原件单独一组、默认折叠；导入工具维护的字段（条号索引、字数、token、哈希）hidden，不进表单
    { key: 'import', label: '原件', collapse: 'collapsed' },
  ],

  fields: {
    policy: Field.masterDetail('brightrule_policy', { label: '所属制度', required: true, group: 'details', deleteBehavior: 'restrict' }),
    version_no: Field.text({ label: '版本号', maxLength: 20, group: 'details' }),
    title: Field.text({ label: '版本标题', required: true, maxLength: 200, group: 'details' }),
    effective_date: Field.date({ label: '生效日期', group: 'details' }),

    version_status: Field.select({
      label: '版本状态',
      group: 'details',
      options: [
        { label: '草稿', value: 'draft', color: '#6B7280', default: true },
        { label: '现行', value: 'current', color: '#10B981' },
        { label: '已失效', value: 'superseded', color: '#9CA3AF' },
      ],
    }),
    change_note: Field.textarea({ label: '修订说明', group: 'details' }),

    body_md: Field.markdown({
      label: '正文',
      group: 'content',
      description: '脱敏后的正文全文（Markdown）：条文以 **第X条** 开头，章节用 ## 标题。AI 按它作答，规范性附件的全文在附件里',
    }),
    article_index: Field.json({ hidden: true,
      label: '条号索引',
      group: 'import',
      description: '每一条：{ article, chapter, redacted: [起, 止] }，偏移按正文的码点计；作答时直接读 body_md 即可',
    }),
    original_file: Field.file({ label: '正文原件（docx / PDF）', group: 'import' }),

    text_chars: Field.number({ hidden: true, label: '字数', scale: 0, min: 0, group: 'import', description: '正文的字数（码点数）；0 表示还没有正文' }),
    text_tokens: Field.number({ hidden: true, label: 'Token 估算', scale: 0, min: 0, group: 'import' }),
    content_hash: Field.text({ hidden: true,
      label: '内容哈希',
      maxLength: 64,
      group: 'import',
      description: '正文原件文件字节的 SHA-256（十六进制），导入去重用',
    }),
  },
});
