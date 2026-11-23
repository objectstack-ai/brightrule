import type { Plugin, PluginContext } from '@objectstack/core';
import { KNOWLEDGE_SERVICE, type IKnowledgeService } from '@objectstack/spec/contracts';
import { POLICY_CLAUSE_SOURCE_ID } from './knowledge-source.js';

/**
 * The knowledge service, as the hooks reach it. A lifecycle hook's context
 * carries the data API and no service registry, so this plugin resolves the
 * service once the kernel is up and hands it to the hooks.
 *
 * The hand-off is a process-wide registered symbol, not a module variable: the
 * build bundles each hook handler into its own runtime module, so the hook and
 * this plugin do not share one copy of this file's module scope.
 */
const KNOWLEDGE_SLOT = Symbol.for('ai.objectstack.brightrule.knowledge');
type Slot = { [KNOWLEDGE_SLOT]?: IKnowledgeService };

export function getPolicyKnowledge(): IKnowledgeService | undefined {
  return (globalThis as Slot)[KNOWLEDGE_SLOT];
}

/** Bind the service the hooks read (also the test seam). */
export function setPolicyKnowledge(service: IKnowledgeService | undefined): void {
  (globalThis as Slot)[KNOWLEDGE_SLOT] = service;
}

/**
 * Wires the inquiry hooks to the knowledge service and builds the clause index
 * at boot. Record changes after boot reach the index through the knowledge
 * service's own event sync; this plugin indexes what was already stored.
 */
export class PolicyQaPlugin implements Plugin {
  name = 'ai.objectstack.brightrule.qa';
  version = '0.1.0';
  type = 'standard' as const;
  dependencies = ['com.objectstack.service.knowledge'];

  async init(): Promise<void> {}

  async start(ctx: PluginContext): Promise<void> {
    ctx.hook('kernel:ready', async () => {
      const service = ctx.getService<IKnowledgeService>(KNOWLEDGE_SERVICE);
      setPolicyKnowledge(service);
      const result = await service.reindexSource(POLICY_CLAUSE_SOURCE_ID);
      ctx.logger.info?.(
        `PolicyQaPlugin: indexed ${result.indexed} of ${result.discovered} policy clause(s) for inquiry` +
          (result.ok ? '' : ` — ${result.message}`),
      );
    });
  }
}
