import { definePermissionSet } from '@objectstack/spec/security';
import { SUGGESTION_TRIAGE_FIELDS } from './suggestion-fields.js';
import { POLICY_DIAGNOSE_CAPABILITY, POLICY_MAINTAIN_CAPABILITY } from './capabilities.js';

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
 * Reads and edits every policy, attachment and 制度意见 (everyone's, past the
 * opinion's private sharing) and writes its triage fields (brightrule#57,
 * src/security/suggestion-fields.ts), and holds 制度诊断, the capability the
 * 「AI 诊断」 action requires. Assigned per person
 * (`sys_user_permission_set`); never a default.
 */
export const PolicyAdminPermissionSet = definePermissionSet({
  name: 'brightrule_policy_admin',
  label: '制度管理员',
  description: '制度、制度附件、制度意见全部可读可改；可分诊、处理制度意见，可在制度上运行 AI 诊断',
  objects: {
    brightrule_policy: ALL,
    brightrule_policy_attachment: ALL,
    brightrule_policy_suggestion: ALL,
    // Read only: the 所属单位 picker lists the units (brightrule#52); the
    // units are maintained by the platform's administrators.
    sys_business_unit: { allowRead: true },
  },
  // Modify All already reaches every field; the triage fields are listed so
  // the grant reads plainly beside the inquirer set's read-only mask. 大类 is
  // not masked here (a mask beside Modify All binds nobody): the intake hook
  // overwrites whatever is sent.
  fields: Object.fromEntries(
    SUGGESTION_TRIAGE_FIELDS.map((f) => [`brightrule_policy_suggestion.${f}`, { readable: true, editable: true }]),
  ),
  systemPermissions: [POLICY_DIAGNOSE_CAPABILITY, POLICY_MAINTAIN_CAPABILITY],
});
