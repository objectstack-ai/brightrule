import { PolicyParentHook } from './policy-parent.hook.js';
import { PolicyTrialHook } from './policy-trial.hook.js';
import { PolicyCategoryGroupHook } from './policy-category-group.hook.js';

/**
 * Lifecycle hooks of the policy object: refuse a policy that names itself as
 * its 上级制度; derive 试行 from a policy's title and 制度大类 from its category.
 *
 * Each is self-contained, so `os build` lowers it to a metadata-only body and
 * the app needs no code plugin (brightrule#19: the clause index, the knowledge
 * service and the form-inquiry hooks are gone; employees ask in the AI chat,
 * which reads the policy body itself — src/skills/policy-inquiry.skill.ts).
 */
export const policyHooks = [PolicyParentHook, PolicyTrialHook, PolicyCategoryGroupHook];
