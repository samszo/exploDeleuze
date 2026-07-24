import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { omekaClient } from '../lib/omeka-client';
import { getEmbedding } from '../lib/embeddings-client';
import { mapWithConcurrency } from '../lib/concurrency';

const inputSchema = z.object({
  pageSize: z.number().int().positive().default(50),
  concurrency: z.number().int().positive().default(4),
});

const outputSchema = z.object({
  pagesProcessed: z.number(),
  itemsVectorized: z.number(),
  itemsAlreadyCached: z.number(),
});

// Phase 1 du document de conception : script batch d'initialisation. Parcourt
// le corpus par pages, saute les ressources qui possèdent déjà un vecteur
// (idempotence — reprise possible après coupure), et vectorise le reste par
// lots concurrents avant de basculer sur la boucle réactive.
const batchInitStep = createStep({
  id: 'batch-init-vectors',
  description:
    "Parcourt le corpus par pages, saute les ressources déjà vectorisées, et calcule + injecte les embeddings manquants par lots concurrents.",
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    let page = 1;
    let hasMore = true;
    let pagesProcessed = 0;
    let itemsVectorized = 0;
    let itemsAlreadyCached = 0;

    while (hasMore) {
      const { items, hasMore: nextHasMore } = await omekaClient.listItemsPage(page, inputData.pageSize);
      hasMore = nextHasMore;
      pagesProcessed += 1;

      const pending = items.filter((item) => !item.existingVector || item.existingVector.length === 0);
      itemsAlreadyCached += items.length - pending.length;

      await mapWithConcurrency(pending, inputData.concurrency, async (item) => {
        const vector = await getEmbedding(item.text);
        await omekaClient.patchItemVector(item.id, vector);
        itemsVectorized += 1;
      });

      page += 1;
    }

    return { pagesProcessed, itemsVectorized, itemsAlreadyCached };
  },
});

export const vectorBatchInitWorkflow = createWorkflow({
  id: 'vector-batch-init-workflow',
  description:
    "Initialise en une passe idempotente les embeddings (pretopo:embedding) de tout le corpus avant d'activer la boucle réactive.",
  inputSchema,
  outputSchema,
})
  .then(batchInitStep)
  .commit();
