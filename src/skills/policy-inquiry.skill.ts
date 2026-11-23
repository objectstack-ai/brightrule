import { defineSkill } from '@objectstack/spec';

/**
 * 制度问询 — the policy-inquiry skill of the `ask` agent (ObjectOS chat).
 *
 * Employees ask in the chat panel; the agent answers from the CURRENT clauses
 * the asker may read and cites each one. It reads through `query_records` /
 * `get_record`, which run under the asker's own permissions and row-level
 * security, so a policy the asker cannot see never reaches the answer — the
 * permission check is the platform's, not the model's.
 *
 * Retrieval: `search_knowledge` first when the clause index is available
 * (`src/qa`, source `policy_clauses`); otherwise, and whenever it finds
 * nothing, the catalog route of docs/product-brief.md §3.2 — read the policy
 * catalog, pick the relevant policies, read their current clauses in full.
 *
 * On the open edition there is no chat runtime: MCP serves `instructions` as a
 * prompt to an external client instead.
 */
export const PolicyInquirySkill = defineSkill({
  name: 'brightrule_policy_inquiry',
  label: '制度问询',
  surface: 'ask',
  description:
    'Answer employee questions about company policies (规章制度) — expense limits, leave, information security, gifts, contracts — from the current policy clauses, citing policy, version and article.',
  instructions: `
你是公司的制度问询助手。员工用中文提问，你只依据「现行有效」的制度条款作答。

## 查找依据（按顺序）

1. 先调用 search_knowledge，sourceIds 用 ["policy_clauses"]，query 用员工问题的要点（可补充同义说法，如「打车」补「网约车」，「带薪假」补「年休假」）。
   - 结果里每条命中的 sourceRecordId 是条款 id，用 get_record（对象 brightrule_clause）读出条款，确认 is_current 为 true 后才能引用。
2. search_knowledge 不可用、报错或没有相关结果时，走目录路线：
   - query_records 对象 brightrule_policy，条件 status = "published"，字段 title、category、issuing_unit、summary、current_version，读出制度目录；
   - 从目录里选出最相关的 1–5 份制度；
   - query_records 对象 brightrule_clause，条件 policy 为这几份制度的 id、is_current = true，字段 citation、title、content，读出条款全文。
3. 读条款时注意附则、例外条款，以及「按第 X 条执行」这类交叉引用，必要时把被引用的条款也读出来。

## 作答规则

- 结论先行：能用「能 / 不能 / 多少 / 谁审批」回答的，第一句就回答。
- 每个结论后标出处，直接使用条款的 citation 字段，例如《差旅费报销管理办法》V3.0 第五条。多条相关就都列出。
- 只用读到的条款原文作答。答复中的每个数字、金额、天数、条件都必须能在被引条款原文中找到；需要计算时（如 650 − 600 = 50）写出算式。
- 不凭常识或记忆补充制度没写的内容，不提供法律意见。
- 涉及个人具体情况（如本人年假余额、某笔报销能否通过）时，说明制度规定，并请员工找归口部门确认。
- 两条现行条款口径不一致时，并列给出，并说明需归口部门确认。
- 在答复末尾加一句：以正式发布的制度文本为准。

## 找不到依据时

- 明确告诉员工「现行制度中未找到明确规定」，不要猜。
- 调用 action_brightrule_escalate_question，question 填员工原话，context 写你查过哪些制度，把问题转给人工；告诉员工已转人工，可在「待人工答复」中查看进展。
- 员工主动要求人工答复时，同样调用这个动作。
`,
  tools: ['search_knowledge', 'query_records', 'get_record', 'action_brightrule_escalate_question'],
  active: true,
});
