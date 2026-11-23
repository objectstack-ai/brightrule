# 制度问询评测记录（2026-11-23）

在 ObjectOS 企业版上实测明规三条问询路径（AI 对话、MCP、表单问询）的效果，以及 DeepSeek 作为大模型的适配情况。

## 环境

| 项 | 取值 |
|---|---|
| 运行时 | ObjectOS 企业版 18.6.0，制品组合启动（`OS_COMPOSED_ARTIFACT_URL`），离线许可证，单组织 |
| 部署方式 | [`deploy/objectos-ee`](../deploy/objectos-ee/README.md) 的派生镜像（补上问询插件） |
| 数据库 | PostgreSQL 16 + pgvector 0.6.0 |
| 对话模型 | DeepSeek `deepseek-flash`（DeepSeek-V4.1-Flash），系统设置里选平台自带的 DeepSeek 提供商，直连 `api.deepseek.com` |
| 向量模型 | `openai/text-embedding-3-small`（1536 维），仅用于测试；DeepSeek 没有向量化接口 |
| 语料 | 种子数据：5 份制度、10 条条款（9 条现行，1 条为已失效的差旅 V2.0 第五条） |
| 问题集 | [`scripts/eval/questions.json`](../scripts/eval/questions.json)：9 道有依据的题（含口语改写、计算、新旧版本），2 道制度里没有依据的题 |

判分：答案含期望数字或条款号算正确；「引用」指答案含《制度》V__ 第__条；「声明」指末尾有「以正式发布的制度文本为准」。

## 结论

1. **表单问询的 pgvector 检索是准的**：9 道有依据的题，排第一的条款 9/9 正确。但 0.5 的拒答阈值偏高，只答出 6 道。
2. **AI 对话（`ask`）目前用不上本应用的技能和向量检索**，原因在平台（见文末 issue）。现在的回答来自 `ask` 自带的数据查询能力，结论基本正确，但引用不稳定、不转人工。
3. **平台修好后，DeepSeek 能很好地执行技能**：模拟修复后的 `ask`，27/27 道制度题第一步就走向量检索，全部答对并引用条款，6/6 道无依据题转人工。
4. **MCP 现在就能用**：技能作为提示词下发给外部客户端，制度题 18/18 答对，无依据题 4/4 转人工。没有向量检索，走的是制度目录路线。
5. **DeepSeek 不能做向量化**，要另配向量模型；它也不支持 `json_schema` 结构化输出，导致 `ask` 的 `query_data` 工具在 DeepSeek 下必然失败。

## 1. 表单问询（pgvector）

新建「问询」记录，保存钩子用向量检索最相似的现行条款，得分不低于 0.5 就摘录条款作答，否则转「待人工答复」。不调用大模型，每题 0.3–1 秒。

| | 结果 |
|---|---|
| 有依据的题，排第一的条款正确 | 9/9 |
| 有依据的题，得分过阈值并作答 | 6/9（漏答 3 题，得分 0.34–0.48，排第一的条款都是对的） |
| 无依据的题，正确拒答 | 3/3（得分 0.14–0.41） |

漏答题和无依据题的得分区间重叠，单一阈值分不开。上线前要用真实问题集按所选向量模型校准 `MIN_ANSWER_SCORE_BY_ADAPTER.vector`，或者把是否作答交给大模型判断。

## 2. AI 对话（`ask`），现状

`ask` 只加载平台写死的技能名单，「制度问询」技能挂不上；`search_knowledge` 工具也没有注册。每题都是先查文档、看表结构，再按关键词查条款表。

- 经 Vercel AI Gateway 转调 DeepSeek 时，15 轮对话里 6 轮撞上 120 秒的单轮上限。直连 DeepSeek 后，界面里实测每题 7–23 秒，结论正确并带条款链接。
- 回答末尾的「来源」会露出 `{"$icontains":"酒店"}` 这类查询语法。
- 无依据的题会如实说查不到，但不转人工。

## 3. AI 对话（`ask`），平台修复后的模拟

按平台的拼装方式重建 `ask` 的系统提示词，追加「制度问询」技能和 `search_knowledge` 工具，直接调 DeepSeek。`search_knowledge` 真查 pgvector，其余工具调用运行中的企业版，转人工只记录。这一组用的是当时绑定 `search_knowledge` 的技能版本（`63fee72` 之前）。

| | flash 修复后（3 轮，36 次） | v4-pro 修复后（12 次） | flash 现状（12 次） |
|---|---|---|---|
| 制度题第一步调用向量检索 | 27/27 | 9/9 | 0/9 |
| 答对 | 27/27 | 9/9 | 9/9 |
| 引用条款 | 27/27 | 9/9 | 4/9 |
| 结尾声明 | 27/27 | 9/9 | 0/9 |
| 无依据题转人工 | 6/6 | 2/2 | 0/2 |
| 有依据却转人工 | 0 | 0 | — |
| 每题耗时（中位 / 最长） | 9.6 / 16 秒 | 19.8 / 41 秒 | 12.2 / 20 秒 |

`deepseek-flash` 与 `v4-pro` 效果相同，速度快一倍，推荐 flash。现状组也全部答对，是因为语料只有 10 条条款，关键词碰巧都能命中；条款多了以后差距会拉开。

另一个观察：命中后模型没有按技能用 `get_record` 回查命中的条款（0/36），而是又走了一遍目录路线，每题多 1–2 步。

## 4. MCP

外部客户端连 `/api/v1/mcp`，模型在客户端（这里用 DeepSeek 模拟客户自带的大模型），平台按提问人的权限执行工具。可复现：[`scripts/eval/mcp-eval.mjs`](../scripts/eval/mcp-eval.mjs)。

一次问询的过程：`initialize`（平台下发通用说明）→ `tools/list`（17 个数据和动作工具，没有知识检索）→ `prompts/list` / `prompts/get`（取「制度问询」技能）→ 模型多次 `tools/call`：读制度目录、读现行条款，无依据时 `run_action` 转人工 → 作答。服务端每次调用几十毫秒，时间主要花在模型上。

| | 只用平台通用说明 | 技能提示词（本次修改前） | 技能提示词（本次修改后） |
|---|---|---|---|
| 制度题答对并引用条款 | 18/18 | 18/18 | 18/18 |
| 结尾声明 | 0/18 | 18/18 | 18/18 |
| 无依据题转人工 | 0/4 | 1/4 | 4/4 |
| `run_action` 调用次数（无依据题） | — | 12 | 4 |
| 转人工失败后尝试直接写记录 | — | 3 次 | 0 |
| 每题耗时中位 | 16.4 秒 | 10.6 秒 | 9.8 秒 |
| 每题输入 tokens 中位 | 约 9.8 万 | 约 5.1 万 | 约 4.8 万 |

修改前，技能只写了应用内的工具名 `action_brightrule_escalate_question`。在 MCP 上要用 `run_action` 并传 `actionName: brightrule_escalate_question`，模型只能猜，猜出 7 种写法；失败后还会改用 `create_record` 自己建问询记录。本次已在技能里写明两种调用方式，并禁止转人工失败时自行写数据。

## 5. DeepSeek 适配

| 能力 | 结论 | 依据 |
|---|---|---|
| 向量化（embedding） | 不支持 | `/embeddings`、`/v1/embeddings` 返回 404；官方文档只有对话补全、FIM 补全、模型列表、余额四个接口 |
| 工具调用 | 支持 | 本次全部实验 |
| 结构化输出 | 只支持 `json_object`，不支持 `json_schema` | 官方文档；实测 `json_schema` 返回 400「This response_format type is unavailable now」 |
| 遵循技能指令 | 好 | 第 3、4 节 |
| 模型 | `deepseek-flash`、`deepseek-v4-pro`，上下文 1M | 官方模型列表 |

## 平台问题

| Issue | 问题 |
|---|---|
| [objectstack-ai/cloud#4935](https://github.com/objectstack-ai/cloud/issues/4935) | `ask` 不加载应用的 `surface: 'ask'` 技能 |
| [objectstack-ai/cloud#4933](https://github.com/objectstack-ai/cloud/issues/4933) | `search_knowledge` 工具从未注册 |
| [objectstack-ai/cloud#4934](https://github.com/objectstack-ai/cloud/issues/4934) | 选 DeepSeek 时 `query_data` 必然失败 |
| [objectstack-ai/objectstack#36647](https://github.com/objectstack-ai/objectstack/issues/36647) | 制品启动不加载应用的代码插件，也不带插件依赖 |
| [objectstack-ai/objectstack#36650](https://github.com/objectstack-ai/objectstack/issues/36650) | MCP 没有知识检索工具；绑定它的技能会被静默拦下 |

## 待办

- 选定生产用的向量模型，用真实问题集校准向量检索的拒答阈值。
- 平台修复后，重跑第 3 节的对比，确认 `ask` 真正走向量检索；届时再考虑让技能重新绑定 `search_knowledge`。
- 技能写法：命中后只用 `get_record` 读命中的条款；是否只回答制度问题（现在让它写诗也会照写）。
