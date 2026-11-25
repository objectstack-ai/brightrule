# 版本正文与附件设计说明

> 状态：**维护者 2026-11-25 已定**（本会话）。替代 #22 的「版本文档 `brightrule_policy_document`」设计（一个文件一条记录、正文与附件同表、`doc_kind` 区分）。
> 改动原因：AI 是主要读者。正文与附件同在「版本文档」里时，AI 读 schema 时没有把「版本文档」和「正文」联系起来，实测应用内对话只读了制度主表就回答「正文没有保存在系统中」。

## 1 结构

```
制度 brightrule_policy
 └ current_version ──→ 版本 brightrule_policy_version（正文 body_md 就在这里）
                        └ 附件 brightrule_policy_attachment（主从，只放附件）
```

- **一个版本就是一次发文，正文是它的内容**：正文写在版本上，不再单独成行。
- **附件单独一张子表**：附件1、附表2……，按类别决定 AI 能不能拿它作依据。
- **制度的「现行版本」是指向版本记录的查找字段**：AI 一次 `get_record` 读现行版本就拿到正文，规范性附件可同时用 `related` 带出。
- **原文只以原件文件存**（`original_file`），交给 AI 的只有脱敏 Markdown（`body_md`），由 `tools/redact` 离线生成。

## 2 字段

### 制度 `brightrule_policy`（变化部分）

| 字段 | 类型 | 说明 |
|---|---|---|
| `current_version` | 查找 → `brightrule_policy_version` | 原为文本（版本号）。由版本钩子维护：版本设为现行时指向它；它不再现行且制度仍指向它时清空 |

### 版本 `brightrule_policy_version`（新增部分）

| 字段 | 类型 | 说明 |
|---|---|---|
| `body_md` | Markdown | 正文全文（已脱敏）；条文统一写成 `**第X条**`，章为 `##` |
| `article_index` | JSON | 条号索引，`{ article, chapter, redacted: [起, 止] }`，偏移按 `body_md` 的码点计 |
| `original_file` | 文件 | 正文原件 docx / PDF |
| `text_chars` / `text_tokens` | 整数 | 正文字数（码点）、token 估算；0 表示还没有正文 |
| `content_hash` | 文本（64） | 正文原件文件字节的 SHA-256；不传文件时为 Markdown 的 SHA-256 |

列表视图不放正文；「待发布版本」加了「字数」一列，核对时能看出有没有正文。

### 附件 `brightrule_policy_attachment`（原 `brightrule_policy_document` 改名，去掉正文行）

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | 文本，必填 | **附件自己的名称**，原文怎么写就怎么写（「本集团内训师申报表」），去掉原文自带的「1.」「（一）」序号，不拼制度名 |
| `label` | 文本 | 原文里的编号：「附件1」「附表2」。正文按这个编号引用附件，答复引用出处也写它 |
| `policy_version` | 主从 → 版本，必填 | 权限跟随版本；版本删除时级联删除 |
| `policy` | 查找 → 制度 | 钩子从版本带出；与版本不一致则拒绝 |
| `attachment_class` | 选择，必填 | 规范性 `normative`（与正文同等效力，AI 读）/ 表单 `form` / 仅原件 `original`（都不作依据） |
| `sort_no` | 整数 ≥ 1 | 先后顺序 |
| `is_current` | 布尔 | 钩子维护，随版本状态 |
| `original_file` | 文件 | 原件 |
| `body_md` | Markdown | 规范性附件的全文；`requiredWhen: record.attachment_class == 'normative'` |
| `has_text` / `text_chars` / `text_tokens` / `content_hash` | | 同版本 |

**为什么标题不拼制度名**：原来的标题是「制度全名 附件1 1.附件名」。AI 按制度名查找时会命中附件（尤其是表单），把空表格当成制度内容；而所属制度、版本已经由主从关系表达，重复写进标题没有信息量。

## 3 钩子（`src/qa/version-current.hook.ts`）

- **`VersionCurrentHook`**：版本设为现行时，逐条把它的条款、附件设为现行，把同一制度原来的现行版本改为已失效，制度 `current_version` 指向它，草稿制度改为已发布；版本不再现行而制度仍指向它时，清空指针。
- **`PolicyAttachmentHook`**（原 `PolicyDocumentHook`）：只给版本时带出制度，不一致拒绝（`ATTACHMENT_POLICY_MISMATCH`），版本不存在拒绝（`ATTACHMENT_VERSION_NOT_FOUND`），新建或换版本时按版本状态设 `is_current`。

## 4 导入（`tools/redact`）

- 打包：`附件N` 和 `附表N` 都识别为附件（原来只认「附件」，以「附表1：」开头的表单会整张留在正文里）；附件标题取附件自己的名称，`label` 保留原文写法；正文里写成标题样式的条（`### 第一条 目的`）统一改为 `**第一条** 目的`，条号索引不再漏条。
- 导入：正文写进版本（新建版本时一并写入；版本已有时比对正文和哈希，有变化才更新）；附件按版本 + 序号新建或更新。现行版本内容有变化仍整行拒绝。
- 发布：版本上没有正文，或附件少于导入包的，拒绝发布。
- 导入包格式（`manifest.json`）不变，只给附件加了 `label`。

## 5 种子与测试

- 种子：每个版本的正文由该版本的种子条款拼成；正文原件单独一组 `mode: 'update'` 的种子补写（从源码启动的测试里种子文件不可用，单独一组被跳过时不连累版本、条款和关系）。制度的 `current_version` 不写种子，由版本钩子填写。
- `src/qa/__tests__/version-body.test.ts` 在真实引擎上验证：每份种子制度都指向现行版本、正文可读；新版本设为现行后指针移过去，撤回后清空。

## 6 已部署环境

结构变了，已导入的数据要重新导：

1. 用 `remove` 删掉已导入的制度（或整库重建）；
2. 用新的 `package` 重新打包（附表、条号的修正在打包时生效），再 `import`、`publish`。

旧的 `brightrule_policy_document` 表不再被应用引用，留在库里不影响使用。

## 7 仍待确认

1. MCP `read_file` 能读到原件全文：问询人是否应能通过 MCP 读原件（#10）。
2. 应用内对话的长正文返回待有模型的环境补测。
