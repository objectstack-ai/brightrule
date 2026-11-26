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
 * Which policies an employee may read (published only, by issuing unit, …) is
 * row-level security still to come (#10, docs/visibility.md): until then this
 * set reads every policy.
 */
export const InquirerPermissionSet = definePermissionSet({
  name: 'brightrule_inquirer',
  label: '问询人',
  description: '员工默认权限：读制度和制度附件；提制度意见，只看自己的',
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
  fields: Object.fromEntries(
    SUGGESTION_TRIAGE_FIELDS.map((f) => [`brightrule_policy_suggestion.${f}`, { readable: true, editable: false }]),
  ),
});
