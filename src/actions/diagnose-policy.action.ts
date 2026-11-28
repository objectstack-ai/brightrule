import { defineAction } from '@objectstack/spec/ui';
import { POLICY_DIAGNOSE_CAPABILITY } from '../security/capabilities.js';

/** What the 「AI 诊断」 button answers until diagnosis is built. */
export const DIAGNOSE_PENDING_MESSAGE = 'AI 诊断功能开发中';

/**
 * AI 诊断 — diagnose a policy and file what is found as 「制度意见」
 * (brightrule#48, docs/policy-admin.md).
 *
 * A placeholder for now: the body writes nothing (it is granted no `ctx.api`
 * capability at all) and answers 「AI 诊断功能开发中」. The diagnosis itself
 * cannot be a sandboxed body — the sandbox has no AI call — so it waits for a
 * registered function (self-hosted EE) or the platform's ask-AI action.
 *
 * `requiredPermissions` is the one gate, on both surfaces (ADR-0066 D4): the
 * platform action door answers 403 to a caller without 制度诊断, and the
 * console hides the button from them. Only 制度管理员 grants it. Not exposed to
 * AI agents.
 */
export const DiagnosePolicyAction = defineAction({
  name: 'brightrule_policy_diagnose',
  label: 'AI 诊断',
  icon: 'sparkles',
  objectName: 'brightrule_policy',
  type: 'script',
  locations: ['record_page'],
  requiredPermissions: [POLICY_DIAGNOSE_CAPABILITY],
  body: {
    language: 'js',
    source: `return { ok: true, message: '${DIAGNOSE_PENDING_MESSAGE}' };`,
    capabilities: [],
  },
  successMessage: DIAGNOSE_PENDING_MESSAGE,
  refreshAfter: false,
});
