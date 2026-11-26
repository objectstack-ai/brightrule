import { definePermissionSet } from '@objectstack/spec/security';
import { POLICY_DIAGNOSE_CAPABILITY } from './capabilities.js';

/** Everything on one object: read and edit every record, past sharing. */
const ALL = {
  allowCreate: true,
  allowRead: true,
  allowEdit: true,
  allowDelete: true,
  viewAllRecords: true,
  modifyAllRecords: true,
} as const;

/**
 * 制度管理员 — the policy office (brightrule#48, docs/policy-admin.md).
 *
 * Reads and edits every policy, attachment, clause, inquiry and AI suggestion,
 * and holds 制度诊断, the capability the 「AI 诊断」 action requires. It is the
 * only set that grants anything on 「AI 建议」. Assigned per person
 * (`sys_user_permission_set`); never a default.
 */
export const PolicyAdminPermissionSet = definePermissionSet({
  name: 'brightrule_policy_admin',
  label: '制度管理员',
  description: '制度、制度附件、条款、问询、AI 建议全部可读可改；可在制度上运行 AI 诊断',
  objects: {
    brightrule_policy: ALL,
    brightrule_policy_attachment: ALL,
    brightrule_clause: ALL,
    brightrule_question: ALL,
    brightrule_policy_suggestion: ALL,
    // Read only: the 所属单位 picker lists the units (brightrule#52); the
    // units are maintained by the platform's administrators.
    sys_business_unit: { allowRead: true },
  },
  systemPermissions: [POLICY_DIAGNOSE_CAPABILITY],
});
