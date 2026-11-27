import * as UI from '@objectstack/spec/ui';
import { Policy } from '../objects/policy.object.js';
import { PolicySuggestion } from '../objects/policy-suggestion.object.js';
import { POLICY_MAINTAIN_CAPABILITY } from '../security/capabilities.js';

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
// employees see the library and 制度意见; policy administrators get 「制度维护」.
// 制度附件 is the policy's master-detail child: it is read on the policy's
// record page, not from a menu of its own. Employees ask in the AI chat; the
// inquiry and clause objects are gone (brightrule#19), as are the version and
// relation queues (brightrule#45). 制度意见 is private (brightrule#57): an
// employee's list holds only their own, an administrator's all of them. The
// Notes sample is to be deleted (#10), so it has no entry. The first item is
// where the app opens. 「制度维护」 requires the 制度维护 capability, which only
// 制度管理员 grants, so employees do not see it.
const mainApp: UI.App = {
  name: 'brightrule_main_app',
  label: '明规',
  navigation: [
    { id: 'brightrule_home_nav', type: 'page', pageName: 'brightrule_home', label: '问制度', icon: 'message-circle-question' },
    { id: 'brightrule_policy_library_nav', type: 'object', objectName: Policy.name, viewName: 'published', label: '制度库', icon: 'library' },
    {
      id: 'brightrule_policy_suggestion_nav',
      type: 'object',
      objectName: PolicySuggestion.name,
      label: '制度意见',
      icon: 'message-square-warning',
    },
    {
      id: 'brightrule_maintain_group',
      type: 'group',
      label: '制度维护',
      icon: 'book-open',
      requiredPermissions: [POLICY_MAINTAIN_CAPABILITY],
      children: [
        { id: 'brightrule_policy_nav', type: 'object', objectName: Policy.name, label: '全部制度', icon: 'book-open' },
      ],
    },
  ],
};

export default mainApp;
