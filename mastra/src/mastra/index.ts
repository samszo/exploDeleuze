import { Mastra } from '@mastra/core/mastra';
import { rhizomaticIntensityWorkflow } from './workflows/rhizomatic-intensity-workflow';
import { vectorBatchInitWorkflow } from './workflows/vector-batch-init-workflow';
import { vectorReactiveWorkflow } from './workflows/vector-reactive-workflow';
import { quantumChronicleWorkflow } from './workflows/quantum-chronicle-workflow';
import { chroniqueurCognitifAgent } from './agents/chroniqueur-cognitif';
import { omekaItemUpdatedWebhook } from './server/routes';

export const mastra = new Mastra({
  agents: {
    'chroniqueur-cognitif': chroniqueurCognitifAgent,
  },
  workflows: {
    'rhizomatic-intensity-workflow': rhizomaticIntensityWorkflow,
    'vector-batch-init-workflow': vectorBatchInitWorkflow,
    'vector-reactive-workflow': vectorReactiveWorkflow,
    'quantum-chronicle-workflow': quantumChronicleWorkflow,
  },
  server: {
    apiRoutes: [omekaItemUpdatedWebhook],
  },
});
