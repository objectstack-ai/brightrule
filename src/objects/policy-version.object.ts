import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度版本 — one revision of a policy. A revision is a new version; an
 * effective version is never edited in place (AGENTS.md).
 *
 * Marking a version `current` is the one maintenance act the inquiry index
 * follows: `src/qa/version-current.hook.ts` makes this version's clauses
 * current, supersedes the policy's previous current version and retires its
 * clauses.
 */
export const PolicyVersion = ObjectSchema.create({
  name: 'brightrule_policy_version',
  sharingModel: 'controlled_by_parent',
  label: '制度版本',
  pluralLabel: '制度版本',
  icon: 'git-branch',
  nameField: 'title',
  description: '制度的每一个版本：版本号、状态、修订说明、生效日期',

  fieldGroups: [{ key: 'details', label: '版本信息' }],

  fields: {
    title: Field.text({ label: '版本标题', required: true, maxLength: 200, group: 'details' }),
    policy: Field.masterDetail('brightrule_policy', { label: '所属制度', required: true, group: 'details', deleteBehavior: 'restrict' }),
    version_no: Field.text({ label: '版本号', maxLength: 20, group: 'details' }),
    version_status: Field.select({
      label: '版本状态',
      group: 'details',
      options: [
        { label: '草稿', value: 'draft', color: '#6B7280', default: true },
        { label: '现行', value: 'current', color: '#10B981' },
        { label: '已失效', value: 'superseded', color: '#9CA3AF' },
      ],
    }),
    change_note: Field.textarea({ label: '修订说明', group: 'details' }),
    effective_date: Field.date({ label: '生效日期', group: 'details' }),
  },
});
