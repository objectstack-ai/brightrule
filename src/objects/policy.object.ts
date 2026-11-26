import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度主表 — one row per policy, and its text (brightrule#45).
 *
 * The data comes from the policy file itself — its body and its 制度信息表
 * (policy info table) — through the import tool (`tools/redact`); nobody
 * re-keys it by hand. So the policy is one flat table: the body is a field of
 * the policy (`body_md`), and its only child is 制度附件
 * (`brightrule_policy_attachment`, master-detail). There are no versions: a
 * revision overwrites the body, and the original file (`original_file`) is the
 * archive of what was issued.
 *
 * The original text lives ONLY in `original_file` (the docx / PDF as issued);
 * `body_md` is the redacted Markdown produced offline by `tools/redact`. The
 * original is never stored as a text field: a text field a person can read is
 * one the AI reads on their behalf.
 *
 * Changing `status` carries to the clause rows of the policy (`is_current`,
 * src/qa/policy-status.hook.ts) while the clause table lives (brightrule#19).
 *
 * Named `brightrule_policy`, never bare `policy`: on this platform *policy*
 * means a permission / security policy (AGENTS.md).
 */
export const Policy = ObjectSchema.create({
  name: 'brightrule_policy',
  // Reference data: every member reads a policy, its owner maintains it.
  // Issuing-unit visibility (group-wide vs one subsidiary) is a sharing-rule
  // layer on top of this, per docs/visibility.md — not built yet.
  sharingModel: 'public_read',
  label: '制度',
  pluralLabel: '制度',
  icon: 'book-open',
  nameField: 'title',
  description: '每份制度一行：制度信息、正文和原件都在这里，附件在「制度附件」里',

  fieldGroups: [
    { key: 'basic', label: '基本信息' },
    { key: 'effect', label: '效力' },
    { key: 'related', label: '关联制度' },
    { key: 'content', label: '正文' },
    // 原件单独一组、默认折叠；导入工具维护的字段（条号索引、字数、token、哈希）hidden，不进表单
    { key: 'import', label: '原件', collapse: 'collapsed' },
  ],

  fields: {
    title: Field.text({ label: '制度名称', required: true, searchable: true, maxLength: 200, group: 'basic' }),
    policy_no: Field.text({ label: '制度编号', maxLength: 50, group: 'basic' }),
    doc_no: Field.text({
      label: '文号',
      maxLength: 100,
      group: 'basic',
      description: '发文字号，如「XX字〔2026〕1号」；引用出处时写在制度名之后',
    }),
    category: Field.select({
      label: '制度分类',
      group: 'basic',
      // The values of the first five predate this list and stay as they were
      // (seed data and stored records use them); only their labels moved to the
      // policy system's own wording.
      options: [
        { label: '公司治理类', value: 'governance' },
        { label: '战略投资类', value: 'strategy' },
        { label: '经营管理类', value: 'operations' },
        { label: '人力资源管理类', value: 'hr' },
        { label: '财务管理类', value: 'finance' },
        { label: '资产管理类', value: 'asset' },
        { label: '审计合规类', value: 'compliance' },
        { label: '安全环保监管类', value: 'safety' },
        { label: '科技与工程管理类', value: 'tech' },
        { label: '数字化管理类', value: 'it' },
        { label: '党工纪类', value: 'party' },
        { label: '综合行政类', value: 'admin' },
      ],
    }),
    policy_level: Field.text({ label: '制度层级', maxLength: 50, group: 'basic', description: '制度信息表里的写法，如「三级管理制度」' }),
    issuing_unit: Field.text({ label: '发文单位', maxLength: 100, group: 'basic' }),
    department: Field.text({ label: '归口部门', maxLength: 100, group: 'basic' }),
    co_departments: Field.text({ label: '协同部门', maxLength: 200, group: 'basic' }),
    review_body: Field.text({ label: '审议主体', maxLength: 100, group: 'basic' }),
    decision_body: Field.text({ label: '决议主体', maxLength: 100, group: 'basic' }),
    summary: Field.textarea({
      label: '目录摘要',
      group: 'basic',
      description: '一两句话说明本制度管什么',
    }),
    status: Field.select({
      label: '状态',
      group: 'effect',
      options: [
        { label: '草稿', value: 'draft', color: '#6B7280', default: true },
        { label: '已发布', value: 'published', color: '#10B981' },
        { label: '修订中', value: 'revising', color: '#F59E0B' },
        { label: '已废止', value: 'abolished', color: '#EF4444' },
      ],
    }),
    effective_date: Field.date({ label: '生效日期', group: 'effect' }),
    next_review_date: Field.date({ label: '下次复审日', group: 'effect' }),

    // 两份都由导入工具从制度信息表填写：原文照录（含库外的法规、文件名），
    // 以及其中名称与库内制度完全一致的那几份（brightrule#45，替代原来的制度关系对象）。
    related_documents: Field.textarea({
      label: '关联制度 / 文件',
      group: 'related',
      description: '制度信息表「关联制度 / 文件」一栏的原文，含库外的法规和文件',
    }),
    related_policies: Field.lookup('brightrule_policy', {
      label: '相关制度',
      group: 'related',
      multiple: true,
      description: '「关联制度 / 文件」里名称与库内制度完全一致的制度，由导入工具自动填写',
    }),

    body_md: Field.markdown({
      label: '正文',
      group: 'content',
      description: '脱敏后的正文全文（Markdown）：条文以 **第X条** 开头，章节用 ## 标题。AI 按它作答，附件的全文在制度附件里',
    }),
    has_images: Field.boolean({
      label: '含图片',
      defaultValue: false,
      group: 'content',
      description: '正文里有图片、图表、SmartArt、公式或嵌入对象（Markdown 里只留「（图片）」等标记，AI 看不到）；导入时自动统计',
    }),
    images_need_review: Field.boolean({
      label: '图片待核对',
      defaultValue: false,
      group: 'content',
      description: '人工勾选：图片里的内容需要补录成文字或重新扫描',
    }),

    original_file: Field.file({ label: '正文原件（docx / PDF）', group: 'import' }),
    article_index: Field.json({
      hidden: true,
      label: '条号索引',
      group: 'import',
      description: '每一条：{ article, chapter, redacted: [起, 止] }，偏移按正文的码点计；作答时直接读 body_md 即可',
    }),
    text_chars: Field.number({ hidden: true, label: '字数', scale: 0, min: 0, group: 'import', description: '正文的字数（码点数）；0 表示还没有正文' }),
    text_tokens: Field.number({ hidden: true, label: 'Token 估算', scale: 0, min: 0, group: 'import' }),
    content_hash: Field.text({
      hidden: true,
      label: '内容哈希',
      maxLength: 64,
      group: 'import',
      description: '正文原件文件字节的 SHA-256（十六进制）；不传文件时为脱敏 Markdown 的 SHA-256，导入去重用',
    }),
  },
});
