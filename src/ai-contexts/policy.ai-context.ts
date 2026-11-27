import type { AiContext } from '@objectstack/spec/ai';

/**
 * 「问这份制度」读的资料包（ADR-0160 context pack）。
 *
 * 员工在制度页点「问这份制度」，助手就钉住这份制度，第一轮先按这个资料包读：
 * 制度的目录字段、正文 body_md，以及挂在它下面的制度附件。全部以提问人的身份读，
 * 读不到的字段和附件不会带上，资料包本身不放开任何权限。
 */
export const PolicyAiContext: AiContext = {
  name: 'brightrule_policy_reading',
  label: '制度正文',
  object: 'brightrule_policy',
  fields: [
    'display_name',
    'title',
    'doc_no',
    'status',
    'category_group',
    'category',
    'policy_level',
    'owning_unit',
    'issuing_unit',
    'department',
    'is_trial',
    'issued_date',
    'effective_date',
    'parent_policy',
  ],
  related: [
    {
      object: 'brightrule_policy_attachment',
      field: 'policy',
      fields: ['label', 'title', 'body_md'],
      orderBy: [{ field: 'sort_no', order: 'asc' }],
      limit: 20,
    },
  ],
  body: { field: 'body_md' },
};
