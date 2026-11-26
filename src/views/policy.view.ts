import * as UI from '@objectstack/spec/ui';
import { Policy } from '../objects/policy.object.js';

// The lists leave out the body: a grid cell is no place to read it, and
// loading it for every row costs the page. 「含图片」「图片待核对」 sit in the
// maintainers' list so the policies whose pictures need a person are easy to
// find. The lists show 「所属单位」, the unit a policy belongs to
// (brightrule#52), in place of 发文单位's verbatim text, which stays on the
// form; 「文件性质」 sits beside 上级制度, which a forwarded or followed policy
// points at.
const policyViews: UI.View = {
  object: Policy.name,
  list: {
    label: '全部制度',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'policy_no' },
      { field: 'doc_no' },
      { field: 'category' },
      { field: 'owning_unit' },
      { field: 'department' },
      { field: 'issuance_type' },
      { field: 'parent_policy' },
      { field: 'status' },
      { field: 'is_trial' },
      { field: 'issued_date' },
      { field: 'effective_date' },
      { field: 'has_images' },
      { field: 'images_need_review' },
    ],
    sort: [{ field: 'policy_no', order: 'asc' }],
  },
  listViews: {
    published: {
      label: '制度库（已发布）',
      type: 'grid',
      columns: [
        { field: 'title' },
        { field: 'doc_no' },
        { field: 'category' },
        { field: 'owning_unit' },
        { field: 'is_trial' },
        { field: 'effective_date' },
        { field: 'next_review_date' },
        { field: 'summary' },
      ],
      filter: [{ field: 'status', operator: 'equals', value: 'published' }],
      sort: [{ field: 'effective_date', order: 'desc' }],
    },
  },
};

export default policyViews;
