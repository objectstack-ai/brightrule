# 制度问询评测集（brightrule#69）

一套题比较制度问询的不同定位路线（目录 / 向量 / 混合）和不同模型，分「定位」和「作答」两层打分。设计见 `docs/inquiry-optimization-2026-11-27.md` §4。

本仓库是**公开仓库**：这里只有合成语料、合成题目和评分器。真实制度和真实题目放在仓库外，用同样的格式，按路径交给评分脚本（见下文「接仓库外题集」）。

## 目录

| 路径 | 内容 |
|---|---|
| `schema.ts` | 三种文件的格式（Zod）：语料、题集、运行记录 |
| `corpus/` | 合成语料：单位树和 persona 账号（`units.ts`）、中文核心制度（`core-zh.ts`，含应用种子的 10 份）、英文小样（`core-en.ts`）、干扰制度生成器（`distractors.ts`） |
| `questions/` | 题集：中文约 250 题（`zh.ts`）、英文小样约 60 题（`en.ts`） |
| `grade/` | 规则评分（`rules.ts`）、模型盲评的接口和提示词（`judge.ts`）、汇总报告（`metrics.ts`） |
| `build.ts` | 生成语料和题集文件 |
| `drive.ts` / `driver/` | 驱动：把语料装进环境、以 persona 账号经 ask 对话路由提问、写运行记录 |
| `grade.ts` | 对运行记录评分、出报告 |
| `mcp-eval.mjs` / `questions.json` | 旧的 MCP 评测（13 题、关键词判分），留作 2026-11-23 评测记录的复现脚本；新题集经 MCP 用 `drive.ts run --via mcp` |
| `generated/`、`results/` | 生成物和结果，已被 git 忽略 |

## 合成语料

- **单位**：示例集团，下属示例甲公司（及其华东分公司）、示例乙公司、示例丙公司；海外 Example International Ltd. 及其英国、新加坡两家子公司。名字都是编的，都以「示例」/「Example」开头。
- **核心制度 77 份**：中文 59 份（应用种子 10 份 + 本目录手写 49 份），英文 18 份。覆盖：同名不同标准（集团和下属公司各有一份差旅、休假……数额不同）、转发、参照执行、试行、已废止和草稿版本（数额不同，不得作依据）、限定范围（只给领导班子 / 高管 / 纪检人员）、按职级或年龄分档、附件表格、引用另一份制度、两份集团制度故意互相冲突。
- **persona 账号 15 个**：每家公司若干员工（普通员工 / 中层 / 高管），外加两个没有登记单位的账号（测「该问的问一次」）。驱动以这些账号登录提问。
- **干扰制度 1,500 份**：分属 40 家编造的公司（没有 persona 属于它们），都有正文；其中约五分之一与核心制度同名（如各家都有《差旅费报销管理办法》，数额随机）。由固定种子生成，同样的参数生成同样的字节（测试钉住了哈希）。

### 生成

```bash
pnpm run eval:build                       # → scripts/eval/generated/corpus.json、questions.json
pnpm run eval:build -- --distractors 2000 # 干扰制度数量，1,000–2,000；0 = 只要核心制度
pnpm run eval:build -- --seed 7 --out /tmp/eval-set
```

约 1.5 秒；语料文件约 3.7 MB（1,500 份干扰制度）。

## 题集

每题标注：问题、提问人 persona、期望制度（`policy_no` 即语料里的 `key`）、期望条号、关键数值、答案要点、是否应反问及 persona 的回答、是否应答「未找到依据」、禁止出现的内容、题型、问法来源、`question_lang` / `policy_lang`。

| 题型 | 中文题数 | 测什么 |
|---|---|---|
| direct 直接事实 | 55 | 基本准确率 |
| paraphrase 口语改写 | 35 | 员工口吻、避开条文原词 |
| calculation 计算 | 13 | 算式和数字 |
| unit_scope 单位口径 | 35 | 提问人所属单位是否用对（含 2 道多轮：自报单位后沿用） |
| rank_tier 职级分档 | 13 | 不知职级时是否全列并问 |
| cross_reference 跨条 / 附件 / 引用 | 25 | 整份阅读是否漏读 |
| no_basis 无依据 | 31 | 正确拒答、不编造、不借用平级公司 |
| permission 权限 | 20 | 平级、限定范围、草稿、已废止各 5 题 |
| clarify 反问 | 13 | 该问的问一次（7 题），不该问的不问（6 题） |
| pinned 指定制度 | 13 | 资料包路径（问这份制度） |
| conflict 跨制度冲突 | 3 | 单独报告 |

英文小样 65 题：英文问英文制度 37 题、英文问中文制度 14 题、中文问英文制度 14 题。英文小样题型很薄（口语改写 1 题、权限 5 题），英文的分项分数只看方向，不作结论。

**偏差来源（要记在报告里）**：所有题都是为本题集编写的（`source: written`），口语改写题不是线上真实问法——仓库里没有真实提问。真实问法的题集接进来之前，口语改写题的分数偏乐观。

**权限题**：brightrule#70（已发布行级规则）落地之前，员工能读到全部制度，包括草稿、已废止、平级和限定范围的。所以权限题现在只测「模型是否听话」，报告里单独列，不算进总分、不当零容忍门槛。

### 标注怎么保证不错

`__tests__/eval-set.test.ts` 逐题检查：

- 期望的条号在制度里真有，关键数值在那一条（或附件）的正文里真有（计算题除外）；
- 期望的制度都是已发布的，并在提问人的单位链上（本公司 → 上级）；
- 「禁止出现」的数字或文字不会出现在正确依据里（不和正确答案撞车）；
- 「无依据」题列出的关键词，在提问人单位链上的任何一份已发布制度里都找不到；
- 题型配比与设计文档 §4.2 相差不超过 1.5 个百分点，无依据 ≥ 30 题，权限每个子类 ≥ 5 题。

新增题目跑 `pnpm test` 就能知道标注有没有错。

## 跑评测（驱动）

驱动走员工用的 ask 对话路由：每题以对应 persona 的账号**登录**提问。平台只给登录会话注入「提问人」块（所属公司、单位链，cloud#5099），API key 和 MCP 都拿不到，所以不能用 API key 跑。

驱动有两条路线：默认走 ask 对话（企业版、云上）；`--via mcp` 走 MCP（社区版也能跑，见下文「社区版：经 MCP」）。

前提：一个已经在运行、装好 BrightRule、专门用来评测的环境（本地企业版栈、社区版或云上环境），和它的管理员账号（用环境变量 `EVAL_ADMIN_EMAIL` / `EVAL_ADMIN_PASSWORD` 传入，`setup` 必需，`run` 用它换算记录 id、读 token）。密码只从环境变量读，不写进文件。

```bash
pnpm run eval:build -- --distractors 1500       # 先生成语料和题集
export EVAL_ADMIN_EMAIL=… EVAL_ADMIN_PASSWORD=…  # 环境管理员
export EVAL_PERSONA_PASSWORD=…                   # persona 账号统一用的密码（自己定）

# 1. 装语料：单位、persona 账号及其所属单位、AI 席位、制度和附件（可重复跑，只改有差异的）
pnpm run eval:drive -- setup --base https://ENV

# 2. 提问：每题 × 轮数，写 results/run-时间.jsonl；--grade 跑完直接出报告
pnpm run eval:drive -- run --base https://ENV --reps 3 --concurrency 4 --tokens --grade
```

`setup` 做的事（都按稳定键 upsert）：

- 单位按 `code`，先上级后下级；
- persona 账号按邮箱：管理员建号后账号自己改一次密码（平台要求），已有账号密码不对时重置；
- 所属单位写 `sys_business_unit_member`（`is_primary`），这是平台算提问人单位的来源；没有单位的 persona 会删掉它的成员关系；
- 给每个 persona 授予「问询人」权限集（`brightrule_inquirer`，可用 `--permission-set` 换）。应用把它设成默认、启动时绑给所有人，但在运行中的环境里装应用，要到下次启动才绑上；没有它，persona 一份制度也读不到，模型只会答「没有权限」；
- 给每个 persona 分 AI 席位（没有席位的环境跳过，记警告）；
- 制度按 `policy_no`（= 语料 `key`），再补「上级制度」链接，附件按（制度，序号）。试行和制度大类留给应用的钩子推导。

环境里语料没有的制度不会删，会留在目录里当干扰项，所以要用专门的评测环境。

`run` 的选项：

| 选项 | 作用 |
|---|---|
| `--only ID,ID` / `--type direct,calculation` / `--limit N` | 选题 |
| `--reps 3` | 每题轮数（报告给轮间噪声） |
| `--concurrency 4` | 同时进行的对话数 |
| `--route catalog\|vector\|hybrid` | 给这次运行打路线标签。走哪条路线由环境决定（现在只有目录路线；向量 / 混合等技能和平台检索就绪后，在环境里切换） |
| `--model ID` | 指定模型（不填用环境默认） |
| `--config NAME` | 报告里的配置名，默认 `路线/模型` |
| `--out FILE` / `--resume` | 结果文件；`--resume` 跳过文件里已成功的题，接着跑 |
| `--raw DIR` | 每题另存一份原始轨迹（每轮的文字和工具调用，含工具输出），查失分用 |
| `--tokens` | 跑完用管理员读 `ai_traces`，把每段对话的输入 / 输出 token 写进记录（含多轮题的前置轮） |
| `--grade` | 跑完调用 `grade.ts` 出报告（`.report.json` / `.report.md`） |
| `--questions FILE` / `--corpus FILE` | 仓库外题集（见下文） |

驱动的规则：

- 轨迹里 `get_record` 读到的制度算「读过」；`query_records` 返回的行带正文（`body_md`）时也算读过。工具答 `{ error }` 的调用不算；
- 多轮题的前置轮先在同一段对话里发，答复不评分，工具调用不计入定位；
- 指定制度题把对话钉在那份制度上（`context.focus`，和制度页「问这份制度」一样）；
- 第一次答复是反问时，按题目的 `clarify_reply`（没有就用 persona 的自我介绍）自动回答一次，评第二次答复；再反问不再回答；
- 记录 id 按 `policy_no` 换回语料 key；`search_knowledge` 的命中记为检索结果（向量 / 混合路线）。不经模型的纯检索分要等平台检索 API（objectstack#37306）。

### 社区版：经 MCP（`--via mcp`）

社区版（开源框架）没有 ask 对话服务，能测的是 MCP 路线：客户自带模型（任何兼容 OpenAI 的接口），经部署的 MCP 服务器（`/api/v1/mcp`）提问，和外部 MCP 客户端一样。

```bash
pnpm dev                                          # 本地社区版，默认 http://localhost:3000，管理员 admin@objectos.ai / admin123
export EVAL_ADMIN_EMAIL=admin@objectos.ai EVAL_ADMIN_PASSWORD=admin123 EVAL_PERSONA_PASSWORD=…
pnpm run eval:drive -- setup --base http://localhost:3000   # 同一个 setup；社区版没有 AI 席位，每个账号记一条警告，不影响

export LLM_BASE_URL=https://ai-gateway.vercel.sh/v1 LLM_API_KEY=… LLM_MODEL=anthropic/claude-haiku-5.5
pnpm run eval:drive -- run --via mcp --base http://localhost:3000 --limit 10 --grade
```

和 ask 路线的区别（报告里要单独看，不和 ask 路线的分数直接比）：

- **没有提问人块**：MCP 拿不到所属公司和单位链（cloud#5099 只给 ask 路线的登录会话），模型不知道提问人在哪家公司。单位口径题、反问题、职级题天生吃亏：冒烟里集团员工问住宿标准，模型也先反问「您在哪家公司」。
- **系统提示**：服务器的 `initialize` 说明；`--arm prompt`（默认）再加经 `prompts/get` 取的制度问询技能，`--arm plain` 不加。
- **指定制度题**：MCP 没有 `context.focus`，驱动把「已钉住这份制度、记录 id」写进系统提示，像一个知道当前页面的 MCP 客户端。
- **不写数据**：写记录、执行动作、存草稿的工具一律答拒绝（`--execute-writes` 放行）。
- **token**：直接取模型接口返回的 usage，只算评分的那几轮（不含多轮题的前置轮），不需要 `--tokens`。
- 每轮最多调 20 次模型（`--max-steps`），到上限仍没有答复记为出错；工具结果给模型看前 6 万字。
- 配置名默认 `mcp/模型/arm`，同一份结果文件里可以和 ask 路线的记录并排出报告。

### 耗时和用量

2026-11-28 在本地企业版栈上冒烟（BrightRule 0.1.0，语料 77 份核心 + 1,500 份干扰，目录路线，环境默认模型，各 1 轮）：

| | 结果 |
|---|---|
| `setup` | 48 个单位、15 个账号、1,577 份制度、5 个附件，197 秒（并发 8）；再跑一次只核对，账号部分 3 秒 |
| zh-pinned-01 指定制度 | 7 秒，1 次工具调用，输入约 6.2 万 token |
| zh-direct-01 直接事实 | 12 秒，4 次，约 15.3 万 token |
| zh-clarify-01 反问（自动回答一轮） | 103 秒，16 次，约 55.2 万 token：没有单位时模型按名称拉出几十份同名制度的正文 |

三题规则分都是 2/2，反问被识别并自动回答。

按这个量级粗估（未实测）：全量 321 题一轮约 0.6–1 亿输入 token（目录路线上多数是缓存读），并发 4 约半小时到一小时。先用 `--limit` 或 `--type` 小批试跑，看清单价再上全量和多轮。

社区版经 MCP（2026-11-28，BrightRule `pnpm dev`，同一份语料，Haiku 经网关，`--arm prompt`）：`setup` 181 秒；zh-direct-01 23 秒、8 次工具调用、约 18.2 万输入 token，先反问单位、自动回答后答对；zh-clarify-01 19 秒、8 次、约 17.2 万，反问后答对。两题规则分都是 2/2。

## 评分

运行记录（驱动写，每行一个 JSON，格式见 `schema.ts` 的 `RunRecord`）交给评分脚本：

```bash
pnpm run eval:grade -- results/run.jsonl --out results/report.json --md results/report.md
```

### 规则判分（不经模型，`grade/rules.ts`，有单测）

- **关键数值**：按数值比（`50 万` = `500,000` = `五十万`），文字值按短语比。
- **条号**：`第十五条` = `第15条` = `Article 15`；附件 `附件1` = `Appendix 1`。
- **出处**：答复里出现文号，或「所属单位：制度名称」。
- **引文逐字可核**：引号（「」“”『』""）里的原文须在轨迹实际读到的制度（加上指定制度、检索命中的制度）正文或附件中逐字出现，没读过的制度里的引文不算可核；节选用省略号分段核对。结论里的数字须出现在引文中。
- **泄露**：「禁止出现」的制度、文字或数字（可限定在某个词附近）出现即记泄露，该题 0 分。
- **拒答**、**反问**、**答复语言**：按文字模式识别。反问含不带问号的「请告诉我您所在的公司和职级」。无依据题答成反问记 0 分，但不算编造。
- **定位层**：用轨迹里实际 `get_record` 读到的制度，算制度级 recall@1 / @3 和 MRR；向量 / 混合路线另报不经模型的条级 recall@5 / @10。

每题规则分：有泄露 0；无依据题拒答 2、否则 0；有关键数值的，全对 2、部分 1、都不对 0；其余交给盲评。

### 模型盲评（`grade/judge.ts`）

只评「答案要点」是否说到，2 / 1 / 0。盲评模型选一个不弱于被测模型的。盲评只看到问题、提问人、参考要点和答复，看不到是哪个模型或哪条路线答的。设置了下面三个环境变量时，评分脚本调用它（任何兼容 OpenAI 的接口）：

```bash
JUDGE_BASE_URL=https://ai-gateway.vercel.sh/v1 JUDGE_API_KEY=… JUDGE_MODEL=… pnpm run eval:grade -- results/run.jsonl
```

最终分：有泄露 0；规则分和盲评分都有时取低的；只有一个就用那一个。没配盲评时，没有关键数值的题记 0，报告第一行写明「Judge: not run」。

### 报告

总分（不含权限题和冲突题）、按题型、按「提问语言 → 制度语言」分、定位 recall@1/@3 和 MRR、检索 recall@5/@10、引文可核率、结论数字入引文率、编造率、无依据正确拒答率、反问精确率 / 召回率、泄露数（按子类）、答复语言一致率、时延中位 / p90、平均输入 token、各轮得分和轮间噪声（标准差、极差）。

## 接仓库外题集

真实（脱敏）语料和题目**不进本仓库**。按 `schema.ts` 的 `Corpus` 和 `QuestionSet` 格式写成两个 JSON 文件，放在仓库外（项目文件夹或客户侧），评分时按路径传入：

```bash
pnpm run eval:grade -- /path/run.jsonl --questions /path/real-questions.json --corpus /path/real-corpus.json
```

- 语料里每份制度的 `key` 就是加载到应用后的 `policy_no`，驱动用它把轨迹里的记录 id 换回制度。
- 线上真实问法的题，`source` 写 `online`。
- 已有的真实题目（如 2026-11-26 线上 130 题）补齐标注字段后即可并入；只有答案要点、没有关键数值的题，靠盲评打分。
