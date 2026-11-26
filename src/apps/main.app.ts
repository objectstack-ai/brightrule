import * as UI from '@objectstack/spec/ui';
import { Policy } from '../objects/policy.object.js';
import { PolicySuggestion } from '../objects/policy-suggestion.object.js';
import { POLICY_DIAGNOSE_CAPABILITY } from '../security/capabilities.js';

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
// not from a menu of its own. Employees ask in the AI chat; the inquiry and
// clause objects are gone (brightrule#19), as are the version and relation
// queues (brightrule#45). The Notes sample is to be deleted (#10), so it has
// no entry. The first item is where the app opens. 「AI 建议」 is served only to
// policy administrators (brightrule#48); hiding the rest of 「制度维护」 from
// employees waits for the visibility rules (#10).
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
        // Only policy administrators read 「AI 建议」. The server does not drop
        // an object entry the caller cannot read, so the entry asks for the
        // capability only 制度管理员 holds; the data stays guarded by the
        // object grant either way.
        {
          id: 'brightrule_policy_suggestion_nav',
          type: 'object',
          objectName: PolicySuggestion.name,
          label: 'AI 建议',
          icon: 'sparkles',
          requiredPermissions: [POLICY_DIAGNOSE_CAPABILITY],
        },
      ],
    },
  ],
};

export default mainApp;
