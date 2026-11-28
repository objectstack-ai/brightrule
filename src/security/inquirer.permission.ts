import { definePermissionSet } from '@objectstack/spec/security';
import { SUGGESTION_TRIAGE_FIELDS } from './suggestion-fields.js';

/**
 * 问询人 — what every signed-in employee may do (brightrule#48), the app's
 * baseline: `isDefault` binds it to the built-in `everyone` position at boot.
 *
 * Minimal on purpose: read policies and their attachments, and the business
 * units policies belong to. Employees ask in the AI chat, which reads the
 * policies on their behalf (brightrule#19: no inquiry or clause object).
 * File 制度意见 and read and edit one's own (brightrule#57): the object is
 * private, and the intake hook strips the triage fields from an employee's
 * write. No capability, so the 「AI 诊断」 action is hidden from and refused to
 * an employee.
 *
 * An employee reads published policies only (brightrule#70, docs/visibility.md
 * 维度 1): the row-level rule below hides drafts, policies under revision and
 * abolished ones from every read — the policy library, the reading page, and
 * the AI, which reads as the asker. 制度管理员 reads them all through an
 * allow-all rule of its own, which OR-combines with this one
 * (policy-admin.permission.ts).
 *
 * WHICH units' policies an employee reads is decided by sharing, not here
 * (docs/visibility.md principle 3). The policy object is private, and a
 * per-unit sharing rule opens a unit's policies to the unit and every unit
 * under it (brightrule#74, dimension 2; the rules are written by
 * scripts/sharing/policy-unit-sharing.mjs). So an employee reads the policies
 * of their own unit and of every unit above it, and none of a sibling's; an
 * employee in no unit reads none. Attachments follow their policy
 * (controlled_by_parent), with no rule of their own.
 */
export const InquirerPermissionSet = definePermissionSet({
  name: 'brightrule_inquirer',
  label: '问询人',
  description: '员工默认权限：读已发布制度和它们的附件；提制度意见，只看自己的',
  isDefault: true,
  objects: {
    brightrule_policy: { allowRead: true },
    brightrule_policy_attachment: { allowRead: true },
    brightrule_policy_suggestion: { allowCreate: true, allowRead: true, allowEdit: true },
    // The business units a policy belongs to (`owning_unit`, brightrule#52):
    // read only, so the unit's name shows on the policy. The units themselves
    // are maintained by the platform's administrators.
    sys_business_unit: { allowRead: true },
  },
  // An employee reads but does not write the triage and handling fields of
  // 制度意见 (brightrule#57); 制度管理员 grants them back.
  fields: {
    ...Object.fromEntries(
      SUGGESTION_TRIAGE_FIELDS.map((f) => [`brightrule_policy_suggestion.${f}`, { readable: true, editable: false }]),
    ),
    // 大类 is the intake hook's alone: it always derives it from 类别.
    'brightrule_policy_suggestion.category_group': { readable: true, editable: false },
  },
  rowLevelSecurity: [
    {
      name: 'brightrule_inquirer_published_policies',
      label: '只读已发布制度',
      description: '员工只读已发布制度：草稿、修订中、已废止的制度及其附件都读不到（brightrule#70）',
      object: 'brightrule_policy',
      operation: 'select',
      using: "status == 'published'",
    },
  ],
});
