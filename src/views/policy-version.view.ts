import * as UI from '@objectstack/spec/ui';
import { PolicyVersion } from '../objects/policy-version.object.js';

const policyVersionViews: UI.View = {
  object: PolicyVersion.name,
  list: {
    label: '全部版本',
    type: 'grid',
    columns: [
      { field: 'title' },
      { field: 'policy' },
      { field: 'version_no' },
      { field: 'version_status' },
      { field: 'effective_date' },
      { field: 'change_note' },
    ],
  },
};

export default policyVersionViews;
