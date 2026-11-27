import * as UI from '@objectstack/spec/ui';
import { Policy } from '../objects/policy.object.js';

// The lists leave out the body: a grid cell is no place to read it, and
// loading it for every row costs the page. 「含图片」「图片待核对」 sit in the
// maintainers' list so the policies whose pictures need a person are easy to
// find. The lists show 「所属单位」, the unit a policy belongs to
// (brightrule#52), in place of 发文单位's verbatim text, which stays on the
// form; 「文件性质」 sits beside 上级制度, which a forwarded or followed policy
// points at. 制度大类 and 制度层级 (brightrule#54) sit beside 制度分类, so a
// list filters and groups by the policy system's 三类三层级.
// 制度库 by 制度大类: what the home page's three cards open (src/pages/home.page.ts).
const publishedOf = (group: string, label: string) => ({
  label: `制度库 · ${label}`,
  type: 'grid' as const,
  columns: [
    { field: 'title' },
    { field: 'doc_no' },
    { field: 'category' },
    { field: 'policy_level' },
    { field: 'owning_unit' },
    { field: 'is_trial' },
    { field: 'effective_date' },
    { field: 'summary' },
  ],
  filter: [
    { field: 'status', operator: 'equals' as const, value: 'published' },
    { field: 'category_group', operator: 'equals' as const, value: group },
  ],
  sort: [{ field: 'effective_date', order: 'desc' as const }],
});

const policyViews: UI.View = {
  object: Policy.name,
  list: {
    label: '全部制度',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'policy_no' },
      { field: 'doc_no' },
      { field: 'category_group' },
      { field: 'category' },
      { field: 'policy_level' },
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
        { field: 'category_group' },
        { field: 'category' },
        { field: 'policy_level' },
        { field: 'owning_unit' },
        { field: 'is_trial' },
        { field: 'effective_date' },
        { field: 'next_review_date' },
        { field: 'summary' },
      ],
      filter: [{ field: 'status', operator: 'equals', value: 'published' }],
      sort: [{ field: 'effective_date', order: 'desc' }],
      userFilters: {
        element: 'dropdown' as const,
        fields: [{ field: 'category_group' }, { field: 'category' }, { field: 'owning_unit' }, { field: 'policy_level' }],
      },
    },
    published_governance: publishedOf('governance', '治理类'),
    published_operations: publishedOf('operations', '经营管理类'),
    published_party: publishedOf('party', '党工纪类'),
  },
};

export default policyViews;
