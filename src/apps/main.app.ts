import * as UI from '@objectstack/spec/ui';
import { Note } from '../objects/note.object.js';
import { Policy } from '../objects/policy.object.js';
import { PolicyVersion } from '../objects/policy-version.object.js';
import { PolicyDocument } from '../objects/policy-document.object.js';
import { Clause } from '../objects/clause.object.js';
import { Question } from '../objects/question.object.js';

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
//
// The sample object is referenced as `Note.name`, never as a typed-out string:
// scaffolding renamed it to carry this project's namespace. When you delete
// the sample `note` object, delete its entry below too.
const mainApp: UI.App = {
  name: 'brightrule_main_app',
  label: '明规',
  navigation: [
    {
      id: 'brightrule_inquiry_group',
      type: 'group',
      label: '制度问询',
      icon: 'message-circle-question',
      children: [
        { id: 'brightrule_question_nav', type: 'object', objectName: Question.name, label: '我要问询', icon: 'message-circle-question' },
        { id: 'brightrule_question_human_nav', type: 'object', objectName: Question.name, viewName: 'needs_human', label: '待人工答复', icon: 'user-round-check' },
      ],
    },
    {
      id: 'brightrule_maintain_group',
      type: 'group',
      label: '制度维护',
      icon: 'book-open',
      children: [
        { id: 'brightrule_policy_library_nav', type: 'object', objectName: Policy.name, viewName: 'published', label: '制度库', icon: 'library' },
        { id: 'brightrule_policy_nav', type: 'object', objectName: Policy.name, label: '全部制度', icon: 'book-open' },
        { id: 'brightrule_policy_version_nav', type: 'object', objectName: PolicyVersion.name, label: '制度版本', icon: 'git-branch' },
        { id: 'brightrule_policy_document_nav', type: 'object', objectName: PolicyDocument.name, label: '版本文档', icon: 'file-text' },
        { id: 'brightrule_clause_nav', type: 'object', objectName: Clause.name, label: '条款', icon: 'list-ordered' },
        { id: 'brightrule_clause_current_nav', type: 'object', objectName: Clause.name, viewName: 'current', label: '现行条款', icon: 'circle-check' },
      ],
    },
    {
      id: `${Note.name}_nav`,
      type: 'object',
      label: 'Notes',
      objectName: Note.name,
    },
  ],
};

export default mainApp;
