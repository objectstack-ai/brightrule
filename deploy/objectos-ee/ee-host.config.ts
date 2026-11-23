// Entry config of the BrightRule EE image (copied to objectstack.config.ts in
// the image; not part of this project's build or typecheck).
//
// It is the stock ObjectOS EE config, renamed to ee-base.config.ts and left
// unchanged, plus BrightRule's 制度问询 plugins: the knowledge service, the
// retrieval adapter (keyword, or vector when OS_KNOWLEDGE_EMBEDDING_MODEL is
// set) and the clause indexer. The artifact boot does not mount an app's code
// plugins on its own (objectstack-ai/objectstack#36647).
import base from './ee-base.config.ts';

// A runtime path, not a static import: the CLI bundles this file into the EE
// app directory, and the plugins' own imports must resolve from
// /srv/brightrule/node_modules, not from the EE image's.
const QA_PLUGINS = process.env.BRIGHTRULE_QA_PLUGINS ?? '/srv/brightrule/qa/index.js';
const { policyQaPlugins } = await import(QA_PLUGINS);

const extra = (policyQaPlugins() as Array<{ name?: string; start?: unknown }>).filter(
  (p) => p && typeof p.start === 'function',
);
const extraNames = new Set(extra.map((p) => p.name));
console.warn(`[brightrule-host] adding app code plugins: ${[...extraNames].join(', ')}`);

const baseConfig = base as { plugins?: Array<{ name?: string }> } & Record<string, unknown>;
const basePlugins = (baseConfig.plugins ?? []).filter((p) => !extraNames.has(p?.name));

export default { ...baseConfig, plugins: [...basePlugins, ...extra] };
