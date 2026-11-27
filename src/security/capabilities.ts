import { defineCapability } from '@objectstack/spec/security';

/**
 * The authorization capabilities BrightRule defines (ADR-0066 D1): declared
 * here, granted by a permission set's `systemPermissions`, required by a
 * resource's `requiredPermissions`. objectstack.config.ts hands every export
 * of this file to the stack's `capabilities`.
 *
 * Kept out of the permission-set barrel (`./index.ts`): every export of that
 * file is read as a permission set.
 */

/** Name of the 制度诊断 capability, for the action and the set that use it. */
export const POLICY_DIAGNOSE_CAPABILITY = 'brightrule.policy_diagnose';

/**
 * 制度诊断 — run AI diagnosis on a policy (the 「AI 诊断」 action,
 * src/actions/diagnose-policy.action.ts). Granted by 制度管理员
 * (`brightrule_policy_admin`) only.
 */
export const PolicyDiagnoseCapability = defineCapability({
  name: POLICY_DIAGNOSE_CAPABILITY,
  label: '制度诊断',
  description: '在制度上运行 AI 诊断，把诊断结果写入「制度意见」',
  scope: 'org',
});


/** Name of the 制度维护 capability, for the navigation group and the set that grants it. */
export const POLICY_MAINTAIN_CAPABILITY = 'brightrule.policy_maintain';

/**
 * 制度维护 — see the 「制度维护」 navigation group (全部制度, drafts included).
 * Granted by 制度管理员 (`brightrule_policy_admin`) only, so an employee's
 * navigation holds 制度库 and 制度意见 and nothing else. It gates the menu, not
 * the data: what a person may read is still the permission sets' and sharing
 * rules' to say.
 */
export const PolicyMaintainCapability = defineCapability({
  name: POLICY_MAINTAIN_CAPABILITY,
  label: '制度维护',
  description: '在导航中看到「制度维护」（全部制度，含草稿）',
  scope: 'org',
});
