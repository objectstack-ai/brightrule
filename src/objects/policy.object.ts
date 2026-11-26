import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度主表 — one row per policy, and its text (brightrule#45).
 *
 * The data comes from the policy file itself — its body and its 制度信息表
 * (policy info table) — through the import tool (`tools/redact`); nobody
 * re-keys it by hand. So the policy is one flat table: the body is a field of
 * the policy (`body_md`), and the only child that carries its text is 制度附件
 * (`brightrule_policy_attachment`, master-detail). There are no versions: a
 * revision overwrites the body, and the original file (`original_file`) is the
 * archive of what was issued.
 *
 * The original text lives ONLY in `original_file` (the docx / PDF as issued);
 * `body_md` is the redacted Markdown produced offline by `tools/redact`. The
 * original is never stored as a text field: a text field a person can read is
 * one the AI reads on their behalf.
 *
 * The fields an issuing notice carries (brightrule#52, docs/policy-source-fields.md):
 * `owning_unit` 所属单位 (a lookup to the platform business unit — the anchor
 * of per-company visibility), `issued_date`, `issuance_type` (印发 / 转发 /
 * 参照执行), `addressees` (主送, verbatim) and `is_trial`, which a hook derives
 * from the title (src/qa/policy-trial.hook.ts).
 *
 * 制度分类 / 制度大类 / 制度层级 follow the group's policy system, 「三类三层级」
 * (brightrule#54, docs/policy-category-level.md): `category` is one of the 12
 * 小类, `category_group` the major class a hook derives from it
 * (src/qa/policy-category-group.hook.ts), `policy_level` one of three levels.
 *
 * `parent_policy` (上级制度, brightrule#48) names the group policy this one
 * forwards or follows, or the policy above it in the hierarchy; a policy that
 * names itself is refused (src/qa/policy-parent.hook.ts). Opinions on a
 * policy — AI diagnosis findings and employees' own — are 「制度意见」
 * (`brightrule_policy_suggestion`, docs/policy-suggestion.md), which look the
 * policy up rather than hang under it.
 *
 * `status` decides whether the AI answers from a policy: only a published
 * one (src/skills/policy-inquiry.skill.ts). There is no clause table
 * (brightrule#19): the articles live in `body_md`, indexed by `article_index`.
 *
 * Named `brightrule_policy`, never bare `policy`: on this platform *policy*
 * means a permission / security policy (AGENTS.md).
 */
export const Policy = ObjectSchema.create({
  name: 'brightrule_policy',
  // Private: an employee reads a policy only through a sharing rule keyed on
  // `owning_unit` (docs/visibility.md 第 5 节): the group office's policies to
  // the whole group, a company's to that company and the units below it, a
  // subsidiary's also to the group office. The rules name the environment's
  // own business units, so they are rows of that environment
  // (`sys_sharing_rule`), not metadata of this package. 制度管理员 reads every
  // policy past sharing (viewAllRecords). Default deny: a person in no unit a
  // rule names sees no policy.
  sharingModel: 'private',
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
    issuance_type: Field.select({
      label: '文件性质',
      group: 'basic',
      description: '本单位自己印发的，还是转发、参照执行上级单位的制度；转发、参照执行的，在「上级制度」里指向被转发的制度',
      options: [
        { label: '印发', value: 'issue', default: true },
        { label: '转发', value: 'forward' },
        { label: '参照执行', value: 'reference' },
      ],
    }),
    category: Field.select({
      label: '制度分类',
      group: 'basic',
      // The twelve 小类 of the group's policy system (规章制度体系管理规范, 第四条),
      // labelled as it words them. The values of the first five predate this
      // list and stay as they were (seed data and stored records use them); only
      // their labels moved to the policy system's own wording (brightrule#54).
      options: [
        { label: '公司治理类', value: 'governance' },
        { label: '战略投资管理类', value: 'strategy' },
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
    // 三类 — the policy system's 3 major classes above the 12 小类 (brightrule#54).
    // Derived from `category` on insert and when the category changes
    // (src/qa/policy-category-group.hook.ts); not `readonly`, so a maintainer
    // can correct it, as with `is_trial`.
    category_group: Field.select({
      label: '制度大类',
      group: 'basic',
      description: '治理类、经营管理类、党工纪类三类之一；新建、改制度分类时自动带出（公司治理类→治理类，党工纪类→党工纪类，其余→经营管理类），可手改',
      options: [
        { label: '治理类', value: 'governance' },
        { label: '经营管理类', value: 'operations' },
        { label: '党工纪类', value: 'party' },
      ],
    }),
    // 三层级 — and the order of precedence: a level-1 policy prevails over a
    // level-2 one, a level-2 over a level-3 (第四条). The info table's own
    // wording (「三级经营制度」…) stays in the body's 制度信息 table.
    policy_level: Field.select({
      label: '制度层级',
      group: 'basic',
      description: '一级效力高于二级，二级高于三级；制度信息表里的原写法（如「三级管理制度」）留在正文的制度信息表里',
      options: [
        { label: '一级（公司基本管理制度）', value: 'level_1' },
        { label: '二级（部门基本制度）', value: 'level_2' },
        { label: '三级（配套管理细则）', value: 'level_3' },
      ],
    }),
    // A lookup to the platform's business unit (sys_business_unit), so the
    // per-company sharing rules (docs/visibility.md, dimension 2) can name the
    // unit and the units under it. `restrict`: a unit that still owns policies
    // cannot be deleted. No unit name is written in this metadata.
    owning_unit: Field.lookup('sys_business_unit', {
      label: '所属单位',
      group: 'basic',
      deleteBehavior: 'restrict',
      description: '本制度属于哪家单位（集团机关或某下属公司），取自制度文件所在的目录；按单位隔离可见性以它为准',
    }),
    issuing_unit: Field.text({
      label: '发文单位',
      maxLength: 100,
      group: 'basic',
      description: '制度信息表、发文通知上的写法，原文照录；按单位隔离看「所属单位」',
    }),
    department: Field.text({ label: '归口部门', maxLength: 100, group: 'basic' }),
    co_departments: Field.text({ label: '协同部门', maxLength: 200, group: 'basic' }),
    review_body: Field.text({ label: '审议主体', maxLength: 100, group: 'basic' }),
    decision_body: Field.text({ label: '决议主体', maxLength: 100, group: 'basic' }),
    addressees: Field.textarea({
      label: '主送',
      group: 'basic',
      description: '发文通知的主送单位，原文照录，如「集团机关各部室、各下属企业」',
    }),
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
    // Derived from the title on insert and when the title changes
    // (src/qa/policy-trial.hook.ts); not `readonly`, which would strip the
    // hook's write and a maintainer's correction alike.
    is_trial: Field.boolean({
      label: '试行',
      defaultValue: false,
      group: 'effect',
      description: '标题含「试行」或「暂行」即为是；新建、改标题时自动判断，不用手工勾选',
    }),
    issued_date: Field.date({ label: '印发日期', group: 'effect', description: '发文通知落款的日期，与生效日期不同' }),
    effective_date: Field.date({ label: '生效日期', group: 'effect' }),
    next_review_date: Field.date({ label: '下次复审日', group: 'effect' }),

    // 两份都由导入工具从制度信息表填写：原文照录（含库外的法规、文件名），
    // 以及其中名称与库内制度完全一致的那几份（brightrule#45，替代原来的制度关系对象）。
    related_documents: Field.textarea({
      label: '关联制度 / 文件',
      group: 'related',
      description: '制度信息表「关联制度 / 文件」一栏的原文，含库外的法规和文件',
    }),
    parent_policy: Field.lookup('brightrule_policy', {
      label: '上级制度',
      group: 'related',
      description: '本制度转发、参照执行的集团制度，或层级上的上位制度；单选，不能选本制度自己',
      // The reverse list on the parent's page: the policies under it.
      relatedListTitle: '下级制度',
    }),
    related_policies: Field.lookup('brightrule_policy', {
      label: '相关制度',
      group: 'related',
      multiple: true,
      description: '「关联制度 / 文件」里名称与库内制度完全一致的制度，由导入工具自动填写',
      // No reverse list: the forward field already shows the relation, and a
      // list of 「policies naming this one」 only confused readers.
      relatedList: false,
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
