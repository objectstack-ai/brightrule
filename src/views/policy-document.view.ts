import * as UI from '@objectstack/spec/ui';
import { PolicyDocument } from '../objects/policy-document.object.js';

// The list leaves out the long fields (脱敏正文, 条号索引): a grid cell is no
// place to read a policy body, and loading it for every row costs the page.
const policyDocumentViews: UI.View = {
  object: PolicyDocument.name,
  list: {
    label: '全部文档',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'policy_version' },
      { field: 'doc_kind' },
      { field: 'attachment_class' },
      { field: 'sort_no' },
      { field: 'is_current' },
      { field: 'has_text' },
      { field: 'text_chars' },
    ],
  },
};

export default policyDocumentViews;
