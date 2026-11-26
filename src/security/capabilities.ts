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
  description: '在制度上运行 AI 诊断，把诊断建议写入该制度的「AI 建议」',
  scope: 'org',
});
