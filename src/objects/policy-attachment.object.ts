import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 附件 — one attachment (附件N / 附表N) of a policy version. The body is not here: it
 * is the version's own `body_md` (see policy-version.object.ts).
 *
 * Three kinds, by what the AI may do with them:
 *   - normative (规范性): part of the rule (a rate table, a scope list). Its
 *     redacted Markdown is `body_md`, read together with the version's body.
 *   - form (表单): a form people fill in. Never a basis for an answer.
 *   - original (仅原件): no usable text (a scan, an image). Never a basis.
 *
 * As for the body, the original lives ONLY in `original_file`.
 *
 * `title` is the attachment's own name as the source writes it (「本集团内训师
 * 申报表」), and `label` its own number (「附表1」). Neither repeats the policy
 * name: the version link already says whose it is, and a title that begins
 * with the policy name makes a search by that name hit the form, not the body.
 *
 * `policy` and `is_current` are not typed by hand: the attachment hook fills
 * `policy` from the version, and the version hook keeps `is_current` in step
 * with the version's status (src/qa/version-current.hook.ts). Neither is
 * declared `readonly`: the platform strips a readonly field from every
 * non-system write, and the hooks' own writes are not system writes. Who may
 * edit them is the permission sets' job (brightrule#10).
 */
export const PolicyAttachment = ObjectSchema.create({
  name: 'brightrule_policy_attachment',
  sharingModel: 'controlled_by_parent',
  label: '附件',
  pluralLabel: '附件',
  icon: 'paperclip',
  nameField: 'title',
  description:
    '制度版本的附件（附件1、附表2…）。规范性附件（attachment_class = normative）与正文同等效力，全文在 body_md；表单、仅原件的附件不作答复依据。正文不在这里，在版本的 body_md',

  // Quick search matches the title only: an attachment's text can be long.
  searchableFields: ['title'],

  fieldGroups: [
    { key: 'basic', label: '附件' },
    { key: 'content', label: '内容' },
    { key: 'import', label: '导入信息' },
  ],

  fields: {
    title: Field.text({
      label: '标题',
      required: true,
      maxLength: 200,
      group: 'basic',
      description: '附件自己的名称，原文怎么写就怎么写（如「本集团内训师申报表」），不带制度名',
    }),
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
    attachment_class: Field.select({
      label: '附件类别',
      required: true,
      group: 'basic',
      description: 'normative 规范性附件与正文同等效力，一起读；form 表单、original 仅原件不作答复依据',
      options: [
        { label: '规范性（并入全文）', value: 'normative' },
        { label: '表单（交给用户）', value: 'form' },
        { label: '仅原件（无文本）', value: 'original' },
      ],
    }),
    label: Field.text({
      label: '编号',
      maxLength: 20,
      group: 'basic',
      description: '原文里的编号，如「附件1」「附表2」；正文里按这个编号引用附件，引用出处时也写它',
    }),
    sort_no: Field.number({ label: '序号', scale: 0, min: 1, group: 'basic', description: '附件的先后顺序：1、2、3…' }),
    is_current: Field.boolean({
      label: '现行',
      defaultValue: false,
      group: 'basic',
      description: 'true = 属于现行版本；随所属版本的状态自动维护',
    }),

    original_file: Field.file({ label: '原件（docx / PDF）', group: 'content' }),
    body_md: Field.markdown({
      label: '附件正文',
      group: 'content',
      requiredWhen: "record.attachment_class == 'normative'",
      description: '规范性附件的全文（Markdown，已脱敏）；表单、仅原件的附件为空',
    }),

    has_text: Field.boolean({ label: '有文本', defaultValue: false, group: 'import' }),
    text_chars: Field.number({ label: '字数', scale: 0, min: 0, group: 'import' }),
    text_tokens: Field.number({ label: 'Token 估算', scale: 0, min: 0, group: 'import' }),
    content_hash: Field.text({
      label: '内容哈希',
      maxLength: 64,
      group: 'import',
      description: '原件文件字节的 SHA-256（十六进制），导入去重用',
    }),
  },
});
