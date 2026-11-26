/**
 * The triage and handling fields of 制度意见 (brightrule#57): an employee
 * reads them but only 制度管理员 writes them (field permissions on the two
 * sets). 大类 is not listed: the intake hook always derives it from 类别.
 *
 * Kept out of the permission-set barrel (`./index.ts`): every export of that
 * file is read as a permission set.
 */
export const SUGGESTION_TRIAGE_FIELDS = [
  'category',
  'severity',
  'related_policy',
  'source',
  'inquiry_excerpt',
  'quote',
  'triage',
  'status',
  'assignee',
  'resolution',
  'duplicate_of',
  'batch_id',
  'diagnosed_at',
  'run_info',
] as const;
