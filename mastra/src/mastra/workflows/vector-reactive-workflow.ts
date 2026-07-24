import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { omekaClient } from '../lib/omeka-client';
import { getEmbedding } from '../lib/embeddings-client';
import { computeEdge } from '../lib/edge-intensity';
import { loadRetentionState, saveRetentionState } from '../lib/rhizome-intensity';
import { readLatestMatrix, mergeEdgesIntoMatrix, writeMatrixFile } from '../lib/adjacency-matrix';
import { SYNTHETIC_BASE_EDGES, edgeId } from '../lib/synthetic-corpus';
import { env } from '../lib/env';

const inputSchema = z.object({ itemId: z.string() });

// Phase 2 du document de conception : boucle réactive déclenchée par le
// webhook Omeka S (api.items.create / api.items.update). Recalcule
// l'embedding de la ressource modifiée et l'injecte dans Omeka S.
const embedItemStep = createStep({
  id: 'embed-updated-item',
  description: "Récupère la ressource modifiée, recalcule son embedding et le réinjecte dans Omeka S.",
  inputSchema,
  outputSchema: z.object({ itemId: z.string(), label: z.string(), vector: z.array(z.number()) }),
  execute: async ({ inputData }) => {
    const item = await omekaClient.getItem(inputData.itemId);
    const vector = await getEmbedding(item.text);
    await omekaClient.patchItemVector(item.id, vector);
    return { itemId: item.id, label: item.label, vector };
  },
});

// Retrouve les liens touchant le nœud modifié et recalcule leur intensité
// I_AB(t) sans repasser par le recalcul complet du corpus (script batch).
const recomputeNeighborEdgesStep = createStep({
  id: 'recompute-neighbor-edges',
  description: "Retrouve les liens touchant le nœud modifié et recalcule leur intensité I_AB(t) sur la matrice existante.",
  inputSchema: embedItemStep.outputSchema,
  outputSchema: z.object({
    itemId: z.string(),
    edgesRecomputed: z.number(),
    matrixFilePath: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (env.omekaMode !== 'synthetic') {
      throw new Error(
        "OMEKA_MODE=live nécessite une résolution des liens déclarés (vocabulaire relationnel Omeka S) pour identifier les voisins du nœud modifié.",
      );
    }

    const neighborEdges = SYNTHETIC_BASE_EDGES.filter(([a, b]) => a === inputData.itemId || b === inputData.itemId);
    const state = await loadRetentionState();
    const now = new Date().toISOString();
    const nodeLabelsById = new Map<string, string>();
    nodeLabelsById.set(inputData.itemId, inputData.label);

    const updatedEdges = await Promise.all(
      neighborEdges.map(async ([a, b]) => {
        const neighborId = a === inputData.itemId ? b : a;
        const neighbor = await omekaClient.getItem(neighborId);
        let neighborVector = neighbor.existingVector;
        if (!neighborVector) {
          neighborVector = await getEmbedding(neighbor.text);
          await omekaClient.patchItemVector(neighbor.id, neighborVector);
        }
        nodeLabelsById.set(neighbor.id, neighbor.label);

        const id = edgeId(a, b);
        // Pas de nouvelle traversée détectée ici : seule l'affinité sémantique
        // (et donc la flexibilité de la rétention) évolue lors de cette mise à jour.
        const traversalCount = 0;
        const sourceVector = a === inputData.itemId ? inputData.vector : neighborVector;
        const targetVector = a === inputData.itemId ? neighborVector : inputData.vector;

        return computeEdge({ id, sourceId: a, targetId: b, traversalCount, contextualWeight: 0 }, sourceVector, targetVector, now, state);
      }),
    );

    await saveRetentionState(state);
    const base = await readLatestMatrix();
    const merged = mergeEdgesIntoMatrix(base, base?.windowLabel ?? 'reactive', now, nodeLabelsById, updatedEdges);
    const { filePath } = await writeMatrixFile(merged);

    return { itemId: inputData.itemId, edgesRecomputed: updatedEdges.length, matrixFilePath: filePath };
  },
});

export const vectorReactiveWorkflow = createWorkflow({
  id: 'vector-reactive-workflow',
  description:
    "Déclenché par le webhook Omeka S (api.items.create/update) : réactivité en temps réel du rhizome, sans repasser par le script batch complet.",
  inputSchema,
  outputSchema: recomputeNeighborEdgesStep.outputSchema,
})
  .then(embedItemStep)
  .then(recomputeNeighborEdgesStep)
  .commit();
