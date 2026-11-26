# 问询记录的范围、依据与防伪造（`brightrule_question`）设计说明

> **#45 更新（2026-11-25）**：版本已删除，`scope_version` 随之去掉；`scope_kind` 只剩「通用 / 指定制度」；指定的制度不是已发布的，范围钩子拒绝（`QUESTION_SCOPE_POLICY_NOT_PUBLISHED`，制度不存在或读不到为 `QUESTION_SCOPE_POLICY_NOT_FOUND`）；`basis` 为 `[{ policy, article, quote }]`。防伪造钩子不变。下文中涉及版本的部分仅作历史记录。

> 状态：**待维护者在 PR 上确认。**对应 issue #27（专题 #3；详细设计《制度问询与知识检索》2.3「问询对象的改动」、B1.4）。同一分支上另有 #22 的 [`policy-document.md`](policy-document.md)、#23 的 [`policy-relation.md`](policy-relation.md)。
> 本卡只定问询对象的数据模型、两个钩子和视图。「谁写问询记录」（A / B）不在本卡定；问询的权限集在 #10；作答钩子和转人工的去留在 #19。

## 1 做什么

给 `brightrule_question` 加上：

- **范围**：问的是哪份制度、哪个版本；
- **依据**：版本 + 条号 + 摘录，结构化一份、给人看一份；
- **脱敏答复**和**运行记录**；
- 共享模型改为**私有**；
- 堵住「员工带着答复新建问询、伪造 AI 答复」的漏洞。

不管最后由谁写记录，这些字段、校验和权限都一样，所以先把数据模型定下来。

## 2 字段（只做加法）

| 字段 | 类型 | 说明 |
|---|---|---|
| `scope_policy` | 查找 → `brightrule_policy` | 指定制度。只给版本时由钩子带出 |
| `scope_version` | 查找 → `brightrule_policy_version` | 指定版本。选择框只列出现行版本，且选了制度时只列该制度的版本（`lookupFilters`：`version_status = current`、`policy = 本记录的 scope_policy`；制度为空时后一条不生效）。服务端由钩子再校验一次 |
| `scope_kind` | 选择：通用 `general`（默认）/ 指定制度 `policy` / 指定版本 `version` | 由钩子根据上面两个字段推出，提交的值一律被覆盖 |
| `answer_redacted` | Markdown | 模型给出的答复（脱敏版，含代号，不还原） |
| `basis` | JSON | 依据：`[{ policy, version, article, quote }]` |
| `basis_md` | Markdown | 依据区，给人看 |
| `answer_route` | 选择：整份 `whole` / 检索 `search` / 兜底 `fallback` | 一期只会出现「整份」 |
| `run_info` | JSON | 运行记录：模型、token、耗时、用到的版本；B 方式下记对话 id。放在新分组「运行记录」 |

旧字段 `question`、`status`、`answer`、`cited_clause`、`other_references`、`answer_source`（含「人工」值）、`match_score`、`needs_human` 全部保留，定义不变。去留在 #19 定。

新字段除范围两个字段外，与旧的答复字段一样只在保存后显示（`visibleWhen: has(record.id)`），新建表单只填问题和范围。

**视图**：

- 「全部问询」加了 `scope_kind`、`scope_policy`、`scope_version`、`answer_route`；
- 「待人工答复」加了 `scope_policy`、`scope_version`；
- `answer_redacted`、`basis`、`basis_md`、`run_info` 是长 Markdown / JSON，不放进列表，只在记录页看。旧的 `answer` 列保持原样（本卡不改旧列）。

**不设 `readonly`**：`scope_policy`、`scope_kind` 由钩子维护，答复类字段由系统或 AI 写，但都不设 `readonly`。平台对每一次非系统写入都会剥掉 `readonly` 字段（`field.zod.ts` 中 `readonly` 的说明），应用内 AI 代用户的写入不是系统写入，设了 `readonly` 它也写不进去。挡住员工靠的是第 5 节的防伪造钩子。

## 3 「谁写」：两种方式都适用

| | A. 表单问询 | B. 对话技能写日志 |
|---|---|---|
| 谁发起写入 | 员工本人填表保存（REST / 表单） | 应用内 AI 在对话里调用 `create_record`，以员工身份写入 |
| 平台给钩子的标记 | 只有 `session.userId`（员工） | `session.userId`（员工）+ `provenance.performedByAgentId`（AI） |
| 防伪造钩子 | 剥掉员工提交的答复类字段 | 放行 |
| 答复由谁写 | 作答钩子在同一次保存里写回（`beforeInsert`） | AI 自己写进记录 |
| 范围钩子 | 校验员工选的范围 | 校验 AI 填的范围（同样只能是现行版本） |

两种方式要的字段一样：A 方式下作答钩子改为整份作答后写 `answer_redacted`、`basis`、`basis_md`、`answer_route = whole`、`run_info`；B 方式下 AI 写同样的字段，`run_info` 里多记对话 id。钩子不需要知道走的是哪种方式。

两点依赖平台，见第 5.4 节：B 方式能否被放行，取决于平台是否给应用内 AI 的写入打上 `performedByAgentId`；外部 AI（MCP）不被放行。

## 4 范围钩子

`QuestionScopeHook`（`src/qa/question-scope.hook.ts`，`beforeInsert` / `beforeUpdate`，`priority: 60`），已登记到 `policyQaHooks`。写法与 #22、#23 的钩子相同：处理函数不引用外部名称，`os build` 把它降为纯元数据的 body（已在 `dist/objectstack.json` 里确认）。

| 规则 | 拒绝代码 | 中文提示 |
|---|---|---|
| 只给版本时带出 `scope_policy`；给了不一致的制度则拒绝；换版本时制度随之更换 | `QUESTION_SCOPE_POLICY_MISMATCH` | 问询的「指定制度」必须是「指定版本」所属的制度。只选版本即可，指定制度会自动带出。 |
| 版本不存在或提问人无权读取（经 `ctx.api` 以提问人身份读） | `QUESTION_SCOPE_VERSION_NOT_FOUND` | 找不到所选的制度版本，或你无权读取它。 |
| 指定的版本不是现行版本（草稿、已失效都拒） | `QUESTION_SCOPE_VERSION_NOT_CURRENT` | 只能就现行版本提问。所选版本不是现行版本，请改选现行版本，或只选制度。 |

细则：

- **`scope_kind` 的推导**：有版本 → `version`；没有版本、有制度 → `policy`；都没有 → `general`。提交的 `scope_kind` 一律被覆盖。
- **只在范围字段变化时才检查**：更新不涉及 `scope_policy`、`scope_version`、`scope_kind` 时不读库、不检查。只提交了 `scope_kind` 时按原值重新推出，也不读库。
- **「现行」只在指定版本时检查**：新建或更新时提交了 `scope_version` 才检查现行。已有问询的版本后来被替代，之后修改这条问询的其他字段（或只改制度）不会因此被拒——问的时候是现行的。
- **清空版本**：更新时把 `scope_version` 清空而不改制度，制度保留，`scope_kind` 变为 `policy`。
- **排在作答钩子之前**（60 < 100），范围被拒的问题不会先送去模型作答。

## 5 防伪造钩子

`QuestionGuardHook`（`src/qa/question-guard.hook.ts`，`beforeInsert` / `beforeUpdate`，`priority: 50`），已登记到 `policyQaHooks`。同样降为纯元数据的 body。

### 5.1 做什么

新建和修改都适用：除下面两种写入外，把载荷里的答复类字段删掉。

- 剥掉的字段（按 issue）：`answer`、`answer_redacted`、`basis`、`basis_md`、`answer_route`、`run_info`、`answer_source`、`match_score`、`status`、`cited_clause`、`other_references`。
- 不动的字段：`question`、`scope_policy`、`scope_version`、`needs_human`。`scope_kind` 不在名单里，因为范围钩子总会重新推出它。
- **放行**：
  1. 系统写入：`ctx.session.isSystem === true`。包括种子、动作的 body（平台规定动作 body 以系统身份运行，转人工动作即属此类）、声明 `runAs: 'system'` 的钩子或流程。
  2. 应用内 AI 代用户的写入：`ctx.provenance.performedByAgentId` 有值。

**剥掉，不拒绝**：问题本身照常保存；新建时作答钩子随后照常作答。员工看到的是 AI 的答复，不是他提交的内容。剥掉是静默的，不返回提示。

### 5.2 平台提供了什么（已核实）

| 来源 | 内容 |
|---|---|
| `node_modules/@objectstack/spec/src/data/hook.zod.ts`（`HookContext.session`，约 1410–1440 行） | `session.isSystem`：「以系统提升的上下文调用（引擎自身写入）」 |
| 同文件 `HookContext.provenance`（约 1626–1680 行） | `performedByAgentId`：应用内 AI 代 `session.userId` 那个人写入时的 agent；`performedByClientId`：经 `/mcp` OAuth 门进来的外部 AI 客户端；两者都「由服务端盖章，从不由客户端提供」，仅作归属，不作授权 |
| `node_modules/@objectstack/spec/src/kernel/execution-context.zod.ts`（`performedBy`，约 320–432 行） | `performedBy.agentId` 只由「服务端构造的应用内 AI 路径」设置，而且要先在服务端确认是实际运行的 agent 才盖章；请求头、请求体、模型输出都不能设置 |
| `@objectstack/objectql` 的 `buildProvenance()` | 把 `ExecutionContext.performedBy.agentId` 复制为钩子的 `provenance.performedByAgentId` |
| `@objectstack/runtime` 的 `buildSandboxContext()` | 降为 body 的钩子在沙箱里同样拿到 `session` 和 `provenance`；body 删掉的载荷键会从写入里删掉（`applyMutationsToInput`） |

所以钩子能读到，且降为 body 后也能读到（已用构建产物实测，见第 7 节）。

### 5.3 排在作答钩子之前

- 平台的顺序规则：同一事件的钩子按 `priority` **从小到大**执行（`HookSchema.priority`「Lower numbers run first」，默认 100；`@objectstack/objectql` 的 `registerHook` 每次登记后按 `priority` 排序）。
- 作答钩子 `brightrule_question_answer` 没有声明 `priority`，按 100 运行；本卡不改它。
- 防伪造钩子声明 50，范围钩子 60。顺序：防伪造 → 范围 → 作答。构建产物里三者的 `priority` 分别为 50、60、100。
- 为什么必须在前：作答钩子遇到 `answer` 已有值就跳过（把它当成人工或导入的答复）。防伪造钩子排在后面的话，员工带着 `answer` 新建，作答钩子已经跳过，之后再剥掉，记录就没有答复了。
- 证明：`question-engine.test.ts` 在真实引擎上以一个人的身份带 `answer` 新建，结果 `answer` 被换成作答钩子的答复、`answer_source = ai`；`question-guard.test.ts` 按引擎的排序规则把三个钩子排出来，断言顺序并依次执行。

`policyQaHooks` 数组里也把这两个钩子放在作答钩子前面，但顺序由 `priority` 决定，不靠数组顺序。

### 5.4 局限

1. **B 方式依赖平台盖章**：本项目安装的平台包里，只看到读取 `performedBy.agentId` 的代码（引擎、审计、REST），没有设置它的代码——盖章在 ObjectOS 的应用内 AI 服务里，本地没有。本地只能用测试把 `performedBy: { agentId }` 放进执行上下文来模拟（`question-engine.test.ts`），真实对话写入要在有应用内 AI 的环境补测。如果平台在 `create_record` 这条路上没有盖章，B 方式写入的答复会被剥掉，需要回到平台。
2. **外部 AI（MCP）不放行**：经 `/mcp` 进来的写入带的是 `performedByClientId`，不是 `performedByAgentId`，按 issue 只放行应用内 AI，所以被剥掉。B 方式只能走应用内对话。
3. **AI 代写被整体信任**：放行看的是「这次写入由应用内 AI 执行」，不是「内容是 AI 自己的结论」。员工可以在对话里让 AI 把他指定的内容写进答复。这能挡住员工直接伪造，挡不住通过对话诱导 AI 写入。B 方式落地时要在技能里约束，并考虑由 `run_info` 留对话 id 以便追查。
4. **人工答复也被剥掉**：归口部门在表单里填 `answer`、把 `answer_source` 改为「人工」，同样是一个人的直接写入，会被剥掉（开发管理员也一样）。issue 只放行系统和 AI。建议：人工答复改走一个动作（动作 body 以系统身份运行，会被放行），由 #10 的权限集限定谁能用；或在 #19 一并定。见第 9 节。
5. **员工不能关闭自己的问询**：`status` 在名单里，员工改 `status` 也会被剥掉。
6. **没有身份的写入也被剥掉**：既非系统、又没有 AI 标记的写入一律剥掉，宁严勿松。

## 6 改为私有的后果（#10 之前）

`sharingModel` 从 `public_read_write` 改为 `private`（`object.zod.ts` 的四个取值之一：`private` / `public_read` / `public_read_write` / `controlled_by_parent`）。提问人只看自己的问询。

本地实测到的情况：

- **普通员工目前根本不能读写问询**：管理员新建的员工账号，新建和列出问询都被平台拒绝（`403 PERMISSION_DENIED`），原因是对象级权限，与共享模型无关，改私有之前就是如此。转人工动作可以用（动作 body 以系统身份运行）。要等 #10 的权限集。
- **开发管理员能看到所有人的问询**：开发管理员是平台管理员，「Setup、Studio 和每一条记录」都可见，实测列出了员工转人工的那条。这与 issue 预期的「#10 落地前管理员只能看到自己的问询」不同，但不影响本卡。
- **转人工的记录仍归提问人**：动作 body 以系统身份写入，但记录的 `owner_id`、`created_by` 是调用动作的人（实测、单测都确认）。改私有后提问人仍能看到自己转人工的问题。

## 7 实测（2026-11-25，本地 `pnpm dev`，SQLite，全部为合成数据）

`pnpm dev` 跑的是构建产物，所以下面走的是降为 body 的钩子。普通员工没有问询的对象权限（第 6 节），「员工带 `answer` 新建」用开发管理员测：对防伪造钩子来说，开发管理员和员工一样是「一个人的直接写入」。

| 项目 | 结果 |
|---|---|
| 一个人经 REST 带 `answer`（及 `answer_source = human`、`status = answered`、`match_score`、`basis_md`、`run_info`、`answer_route`）新建 | 写入成功；提交的答复类字段全部被剥掉；作答钩子照常作答（本地无模型，列出差旅费办法 V3.0 第五条等参考条款，`answer_source = ai`、`status = open`、`needs_human = true`）；`scope_kind = general` |
| 同一人经 REST 修改：改问题、改 `answer`、`status = closed` | 问题改了；`answer`、`status` 保持原值 |
| 指定已失效版本（差旅费报销管理办法 V2.0） | 拒绝，HTTP 400，`declaredCode: QUESTION_SCOPE_VERSION_NOT_CURRENT`，提示「只能就现行版本提问。……」 |
| 只给版本（差旅费报销管理办法 V3.0） | `scope_policy` 带出为差旅费报销管理办法，`scope_kind = version` |
| 版本与制度不一致 | 拒绝，HTTP 400，`QUESTION_SCOPE_POLICY_MISMATCH` 的中文提示 |
| 只给制度、同时提交 `scope_kind = general` | `scope_kind = policy`（提交值被覆盖） |
| 转人工动作（开发管理员、员工各一次） | 成功；答复「现行制度中未找到明确依据，已转归口部门人工答复。」保留，`needs_human = true`；员工那条 `owner_id` 为员工 |
| 员工新建 / 列出问询 | `403 PERMISSION_DENIED`（对象权限，待 #10） |

另在测试里用构建产物启动（`bootStack(config, { artifact })`）跑了同样几项，加上系统写入和模拟的 AI 代写，结果与源码启动一致：系统写入、AI 代写的答复保留；一个人的答复被剥掉。

**未测**：真实的应用内对话写入（本地没有配置大模型，也没有应用内 AI 服务给写入盖 `performedByAgentId`），需在有模型的环境补测。

## 8 测试

| 文件 | 覆盖 |
|---|---|
| `src/qa/__tests__/question-scope.test.ts`（16） | 三种 `scope_kind` 推导、覆盖提交值；带出制度；拒绝不一致、非现行（已失效、草稿）、不存在；更新时换版本、清空版本、只改无关字段不检查；降为 body 时的载荷形态；排在作答钩子之前 |
| `src/qa/__tests__/question-guard.test.ts`（9） | 名单与 issue 一致；一个人新建、修改被剥；无身份、MCP 外部 AI 被剥；系统写入、应用内 AI 代写放行；降为 body 时的载荷形态；优先级；按引擎顺序执行三个钩子，伪造答复被剥、作答钩子照常作答 |
| `src/qa/__tests__/question-engine.test.ts`（7，真实引擎） | 一个人带答复新建 → 被剥且作答钩子作答；修改被剥；系统写入保留；模拟 AI 代写（执行上下文带 `performedBy.agentId`）保留；转人工动作照常且记录归提问人；只给版本带出制度；拒绝非现行版本 |

## 9 待确认

1. **人工答复怎么写**（第 5.4 节第 4 点）：归口部门在表单里直接改答复会被剥掉。建议做一个「人工答复」动作（以系统身份写入，由 #10 的权限集限定谁能用），或在 #19 一并定。
2. **非现行版本对系统写入也拒绝**：例如将来导入历史问询（当时问的版本现已失效）会被拒。是否对系统写入放开？本卡没有放开。
3. **外部 AI（MCP）写答复**：目前被剥掉。如果 B 方式要支持经 MCP 的客户端，需要另定放行条件。
4. **AI 代写被整体信任**（第 5.4 节第 3 点）：B 方式落地时是否需要更严的条件（例如只认带 `run_info` 对话 id 的写入，或要求 `performedByConfirmationId`）。
5. **剥掉是静默的**：是否需要给提交人一个提示（例如「答复由系统生成，你提交的答复未保存」）。
6. **`needs_human` 不在名单里**：员工可以把自己的问题标为需转人工。按 issue 保持不剥，请确认。
