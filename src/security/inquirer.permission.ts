import { definePermissionSet } from '@objectstack/spec/security';

/**
 * 问询人 — what every signed-in employee may do (brightrule#48), the app's
 * baseline: `isDefault` binds it to the built-in `everyone` position at boot.
 *
 * Minimal on purpose: read policies, their attachments and clauses; ask a
 * question and see only one's own (the inquiry object is private); read the
 * business units policies belong to. Nothing on
 * 「AI 建议」 and no capability, so the 「AI 诊断」 action is hidden from and
 * refused to an employee.
 *
 * Which policies an employee may read (published only, by issuing unit, …) is
 * row-level security still to come (#10, docs/visibility.md): until then this
 * set reads every policy.
 */
export const InquirerPermissionSet = definePermissionSet({
  name: 'brightrule_inquirer',
  label: '问询人',
  description: '员工默认权限：读制度、制度附件和条款；新建问询，只看自己的问询',
  isDefault: true,
  objects: {
    brightrule_policy: { allowRead: true },
    brightrule_policy_attachment: { allowRead: true },
    brightrule_clause: { allowRead: true },
    brightrule_question: { allowCreate: true, allowRead: true },
    // The business units a policy belongs to (`owning_unit`, brightrule#52):
    // read only, so the unit's name shows on the policy. The units themselves
    // are maintained by the platform's administrators.
    sys_business_unit: { allowRead: true },
  },
});
