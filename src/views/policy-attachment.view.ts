import * as UI from '@objectstack/spec/ui';
import { PolicyAttachment } from '../objects/policy-attachment.object.js';

// The list leaves out the attachment text: a grid cell is no place to read it,
// and loading it for every row costs the page.
const policyAttachmentViews: UI.View = {
  object: PolicyAttachment.name,
  list: {
    label: '全部附件',
    type: 'grid',
    columns: [
      { field: 'label' },
      { field: 'title' },
      { field: 'policy' },
      { field: 'sort_no' },
      { field: 'has_images' },
      { field: 'images_need_review' },
    ],
    sort: [{ field: 'sort_no', order: 'asc' }],
  },
};

export default policyAttachmentViews;
