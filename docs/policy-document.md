# 版本文档 `brightrule_policy_document` 设计说明

> 状态：**待维护者在 PR 上确认。**对应 issue #22（专题 #3；详细设计《制度问询与知识检索》2.1）。
> 本说明替代 [`review-2026-11-24.md`](review-2026-11-24.md) 第 76 行「版本文档」一行的旧设计（不再存脱敏 docx 和原文 Markdown）。那个文件本身不改。

## 1 做什么

一个制度版本由一份正文和若干附件组成，每个文件在「版本文档」里占一条记录，主从挂在版本下。

- **原文只以原件文件存**（`original_file`）：员工预览、下载。
- **交给 AI 的只有脱敏正文**（`body_md_redacted`，Markdown），由 `tools/redact` 离线生成。
- 导入（#13）、脚本输出（#11）、技能（#18）都以这个对象为准。

## 2 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | 文本，必填 | nameField；也是唯一参与快速搜索的字段 |
| `policy_version` | 主从 → `brightrule_policy_version`，必填 | 权限跟随父记录（`sharingModel: controlled_by_parent`）；版本删除时级联删除 |
| `policy` | 查找 → `brightrule_policy` | 钩子从版本带出；与版本不一致则拒绝 |
| `doc_kind` | 选择：正文 `body`（默认）/ 附件 `attachment`，必填 | |
| `attachment_class` | 选择：规范性 `normative` / 表单 `form` / 仅原件 `original` | `requiredWhen: record.doc_kind == 'attachment'` |
| `sort_no` | 整数 ≥ 0 | 正文 0，附件 1、2… |
| `is_current` | 布尔，默认 false | 钩子维护，随版本状态 |
| `original_file` | 文件 | 原件 docx / PDF |
| `body_md_redacted` | Markdown | 脱敏正文；`requiredWhen: record.doc_kind == 'body' \|\| record.attachment_class == 'normative'` |
| `article_index` | JSON | 条号索引，见第 3 节 |
| `has_text` | 布尔 | 有无脱敏文本 |
| `text_chars` | 整数 | 脱敏正文字数；无文本为 0 |
| `text_tokens` | 整数 | token 估算；无文本为 0 |
| `content_hash` | 文本（64） | 原件文件字节的 SHA-256，十六进制小写 |

列表视图「全部文档」只放标题、所属版本、类型、附件类别、序号、现行、有文本、字数，不放正文和条号索引。导航：「制度维护」分组，「制度版本」之后的「版本文档」。

## 3 已定事项（维护者 2026-11-25）

- **一个文件一条记录**：每个版本一条正文（`doc_kind = body`，`sort_no = 0`），每个附件一条。
- **原文只以文件存**：不存原文文本，不存脱敏 docx。
- **保留 `is_current`**，由版本钩子同步。
- **`content_hash` 按原件文件字节算**（SHA-256），脱敏字典更新不改变哈希；表单、扫描件也有哈希。
- **`article_index` 每一条为 `{ article, chapter, redacted: [起, 止] }`**：
  - 偏移按 **Unicode 码点** 计（JS `Array.from(s)`，Python `len(s)`），指向 `body_md_redacted`，左闭右开；
  - 起点在该条的 `**第X条**` 标记处，终点为该条正文结束处（不含其后的空行）；
  - 文本没有章时 `chapter` 为 `null`；
  - 不存原文偏移（库里没有原文文本）。
- **一期不加 `index_title`**（随 #21）。
- **版本设为现行时，草稿制度由钩子改为「已发布」**；修订中、已废止不动。

### 字数与 token 估算

定义集中在 `src/data/document-text.ts`，导入脚本（Python）照抄同一定义：

- `text_chars` = `body_md_redacted` 的码点数（含 Markdown 标记与换行）；
- `text_tokens` = ⌈字数 ÷ `CHARS_PER_TOKEN`⌉，`CHARS_PER_TOKEN = 1.5`。这是**估算**，按中文为主的制度文本取经验比例，只用来判断篇幅（能否放进提示词），不用于计费。

## 4 钩子

都在 `src/qa/version-current.hook.ts`，并已登记到 `policyQaHooks`。

- **`PolicyDocumentHook`**（`beforeInsert` / `beforeUpdate`，新增）：写法与 `ClauseCurrentHook` 相同——只给版本时带出制度；制度与版本不一致拒绝（`DOCUMENT_POLICY_MISMATCH`）；版本不存在或无权读取拒绝（`DOCUMENT_VERSION_NOT_FOUND`）；新建或换版本时按版本状态设 `is_current`；既不改版本也不改制度的更新不处理。处理函数不引用外部名称，`os build` 把它降为纯元数据的 body（已在构建产物里确认）。
- **`VersionCurrentHook`**（扩展）：除条款外，同样逐条（经 `ctx.api`，不用谓词批量写）同步该版本文档的 `is_current`；版本为现行时，在原有的制度更新里，若制度状态为 `draft`，一并写 `status: 'published'`。条款行为不变（条款表到 #19 再下线）。

## 5 `policy`、`is_current` 不设 `readonly`

平台对每一次非系统写入都会剥掉 `readonly` 字段（见 `@objectstack/spec` 的 `field.zod.ts` 中 `readonly` 的说明），而钩子里的写入不一定是系统写入，设了 `readonly` 钩子就写不进去。谁能改这两个字段交给权限集（#10），与条款一致。

## 6 种子与合成原件

- 每个已有版本一条正文：脱敏正文由该版本已有的种子条款拼成（`# 制度名（版本号）`，然后每条 `**第X条** 标题` 加正文），`article_index`、`text_chars`、`text_tokens`、`has_text`、`is_current` 全部由代码计算，不手填。
- 差旅费报销管理办法 V3.0 另有两个附件：附件 1 住宿标准表（规范性，Markdown 表格）、附件 2 出差审批单（表单，无文本，`has_text = false`）。
- **原件**：仓库公开，#4 规定不提交任何 docx / doc / pdf / xlsx，真实制度也不进仓库。因此每条记录的原件是 `fixtures/originals/` 下的**合成纯文本占位文件**（`.txt`，首行标明【合成示例原件】），用平台的种子文件机制 `seedFile(...)` 写入 `original_file`：`os build` 把字节打进产物，种子加载时存为平台文件。`content_hash` 是这些文件字节的 SHA-256，写在 `seed.ts` 里，单测逐个对照文件核验。
  - **待维护者决定**：如果希望演示时原件就是 docx，可以改为构建时生成 docx（不提交二进制）；本卡先用 txt。
  - 说明：`pnpm test` 里 `note.test.ts` 直接从源码启动应用（不经 `os build`），种子文件没有被打包，加载器会对这 8 条文档打印警告并跳过它们；`pnpm dev` / `os build` 正常加载（实测种子 29 行全部写入，原件可下载，下载字节的 SHA-256 与 `content_hash` 一致）。

## 7 实测（2026-11-25，本地 `pnpm dev`，SQLite，全部为合成数据）

| 项目 | 结果 |
|---|---|
| `markdown` 字段存约 2 万字 | 通过 REST 写入 20,000 字（其中汉字 17,376）的合成正文，读回 20,000 字、逐字一致，无长度拒绝。另试 100,000 字，同样完整存取。字段本身未见长度上限（数据库为 SQLite；PostgreSQL 未测）。 |
| 约 1.2 万 token 正文经 MCP 返回 | 上述 20,000 字正文（估算 13,334 token），经本地 MCP 端点 `/api/v1/mcp`：`get_record` 返回 21,174 字符的 JSON，正文 20,000 字完整一致；`query_records` 返回 22,227 字符，正文同样完整。**服务端未截断。**MCP 客户端（如 Claude Desktop）自身是否截断未测。 |
| 应用内对话 | **未测**：本地没有配置大模型，应用内对话不可用。需在有模型的环境补测。 |
| `get_record` 对 `original_file` | 只返回文件信息：`{ id, name, size, mimeType, url }`，不返回内容。 |
| ⚠ MCP `read_file` | **会返回原件内容**：对 `original_file` 调 `read_file`，返回文件信息、短期下载链接和**全文**（txt、PDF、docx 均会抽取文本，上限 10 MB）。条件只是能读这条记录。也就是说，接入 MCP 的外部 AI 能读到原文。字段级权限能否挡住 `read_file` 本卡未测（权限集在 #10）。 |

验收中「把某版本设为现行」也在本地跑通：新建草稿制度和草稿版本，挂一条文档（只给版本，制度由钩子带出，`is_current = false`）；把版本设为现行后文档变为 `true`、制度变为「已发布」；再建 V2.0 并设为现行，V1.0 变为已失效，其文档变为 `false`，V2.0 的文档为 `true`。制度与版本不一致的写入被拒，返回上面的中文提示。

第二项没有截断，因此本卡不提出按章拆分的方案。

## 8 待确认

1. 原件占位用 txt 还是构建时生成 docx（第 6 节）。
2. MCP `read_file` 能读到原件全文（第 7 节）：问询人是否应能通过 MCP 读原件？如不应，#10 需要对 `original_file` 做字段级限制，并实测它是否挡住 `read_file`；或关闭该工具。
3. 应用内对话的长正文返回待有模型的环境补测。
