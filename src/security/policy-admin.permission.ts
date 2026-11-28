import { definePermissionSet } from '@objectstack/spec/security';
import { SUGGESTION_TRIAGE_FIELDS } from './suggestion-fields.js';
import { POLICY_DIAGNOSE_CAPABILITY, POLICY_MAINTAIN_CAPABILITY } from './capabilities.js';

/** Everything on one object: read and edit every record, past sharing, and read every field (protocol 19: View All / Modify All no longer vote on fields). */
const ALL = {
  allowCreate: true,
  allowRead: true,
  allowEdit: true,
  allowDelete: true,
  viewAllRecords: true,
  modifyAllRecords: true,
  viewAllFields: true,
} as const;

/**
 * 制度管理员 — the policy office (brightrule#48, docs/policy-admin.md).
 *
 * Reads and edits every policy, attachment and 制度意见 (everyone's, past the
 * opinion's private sharing) and writes its triage fields (brightrule#57,
 * src/security/suggestion-fields.ts), and holds 制度诊断, the capability the
 * 「AI 诊断」 action requires. Assigned per person
 * (`sys_user_permission_set`); never a default.
 *
 * Its holders hold 问询人 too, whose row-level rule reads published policies
 * only (brightrule#70). Read rules of the sets a user holds OR-combine, and
 * View All does not pass them on a public_read object, so this set carries an
 * allow-all rule on 制度: the policy office reads drafts, policies under
 * revision and abolished ones, and edits them (an edit reaches the rows a
 * read reaches). Attachments follow their policy.
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
  // Since protocol 19 Modify All widens records only and casts no field vote,
  // so the inquirer set's read-only masks bind this set's holders too unless a
  // field row here grants the edit. The triage fields are granted here; so is
  // 大类, which the inquirer set masks read-only: a triage payload may carry
  // it, and the intake hook overwrites whatever is sent.
  fields: Object.fromEntries(
    [...SUGGESTION_TRIAGE_FIELDS, 'category_group'].map((f) => [
      `brightrule_policy_suggestion.${f}`,
      { readable: true, editable: true },
    ]),
  ),
  systemPermissions: [POLICY_DIAGNOSE_CAPABILITY, POLICY_MAINTAIN_CAPABILITY],
  rowLevelSecurity: [
    {
      name: 'brightrule_policy_admin_all_policies',
      label: '读全部制度',
      description: '制度管理员读全部制度，含草稿、修订中、已废止；越过问询人的「只读已发布制度」（brightrule#70）',
      object: 'brightrule_policy',
      operation: 'select',
      using: 'true',
    },
  ],
});
