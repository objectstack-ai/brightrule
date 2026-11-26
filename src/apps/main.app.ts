import * as UI from '@objectstack/spec/ui';
import { Policy } from '../objects/policy.object.js';

/**
 * Main App
 */
// This project's app: what the Console lists beside the platform's own apps,
// and what puts an object in the Console's navigation. An object no app lists
// is still served over REST and MCP, but the Console has no route to it.
// Written by `objectstack generate app main --object note`. A package whose
// manifest type is 'app' holds at most one app, so this is the one: to put
// another object in the Console, add a navigation entry for it below (a
// 'group' entry with children nests them) rather than a second app, and give
// it a list view — `objectstack generate view OBJECT` writes one.
// Navigation follows the two audiences (docs/review-2026-11-24.md, M1/M2):
// employees see the library; policy administrators get 「制度维护」. 制度附件
// is the policy's master-detail child: it is read on the policy's record page,
// not from a menu of its own. The inquiry object stays, but has no entry of its
// own (brightrule#45: 「我的问询」「待人工答复」 were removed, as were the version
// and relation queues with their objects). The clause table is being retired
// (D6, #19) and the Notes sample is to be deleted (#10), so neither has an
// entry. The first item is where the app opens. Hiding 「制度维护」 from
// employees waits for the permission sets (#10).
const mainApp: UI.App = {
  name: 'brightrule_main_app',
  label: '明规',
  navigation: [
    { id: 'brightrule_policy_library_nav', type: 'object', objectName: Policy.name, viewName: 'published', label: '制度库', icon: 'library' },
    {
      id: 'brightrule_maintain_group',
      type: 'group',
      label: '制度维护',
      icon: 'book-open',
      children: [
        { id: 'brightrule_policy_nav', type: 'object', objectName: Policy.name, label: '全部制度', icon: 'book-open' },
      ],
    },
  ],
};

export default mainApp;
