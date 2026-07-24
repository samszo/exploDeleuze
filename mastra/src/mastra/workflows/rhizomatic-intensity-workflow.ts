import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { omekaClient } from '../lib/omeka-client';
import { getEmbedding } from '../lib/embeddings-client';
import { computeEdge } from '../lib/edge-intensity';
import { loadRetentionState, saveRetentionState } from '../lib/rhizome-intensity';
import { writeMatrixFile, buildCoefficients } from '../lib/adjacency-matrix';
import { KnowledgeNodeSchema, NodeWithVectorSchema, CorpusSchema, CorpusWithVectorsSchema, AdjacencyMatrixSchema } from '../lib/schemas';

const triggerSchema = z.object({
  windowLabel: z.string().default('default'),
});

// Étape 1 : extraction depuis le socle de connaissances — le sous-graphe de
// base (nœuds + liens prétopologiques) et les traversées de la fenêtre
// courante (agents explorateurs simulés en synthétique, logs réels en live).
export const loadCorpusStep = createStep({
  id: 'load-corpus',
  description:
    "Extrait le sous-graphe (nœuds + liens de base) et les traversées de la fenêtre courante depuis le socle de connaissances (Omeka S ou corpus synthétique).",
  inputSchema: triggerSchema,
  outputSchema: CorpusSchema,
  execute: async ({ inputData }) => {
    const now = new Date().toISOString();
    const edgeCandidates = await omekaClient.listBaseEdges(inputData.windowLabel);

    const nodeIds = new Set<string>();
    for (const edge of edgeCandidates) {
      nodeIds.add(edge.sourceId);
      nodeIds.add(edge.targetId);
    }
    const nodes = await Promise.all([...nodeIds].map((id) => omekaClient.getItem(id)));

    return { windowLabel: inputData.windowLabel, now, nodes, edgeCandidates };
  },
});

// Étape 2 : réutilise le vecteur existant ou en calcule un nouveau via le
// serveur d'embeddings (TEI/BGE-m3, ou synthétique), puis l'injecte dans
// Omeka S — appliquée en parallèle borné à chaque nœud via .foreach().
export const ensureNodeEmbeddingStep = createStep({
  id: 'ensure-node-embedding',
  description:
    "Réutilise le vecteur existant ou en calcule un nouveau via le serveur d'embeddings, puis l'injecte dans Omeka S.",
  inputSchema: KnowledgeNodeSchema,
  outputSchema: NodeWithVectorSchema,
  execute: async ({ inputData }) => {
    if (inputData.existingVector && inputData.existingVector.length > 0) {
      return { id: inputData.id, label: inputData.label, vector: inputData.existingVector, vectorSource: 'cached' as const };
    }
    const vector = await getEmbedding(inputData.text);
    await omekaClient.patchItemVector(inputData.id, vector);
    return { id: inputData.id, label: inputData.label, vector, vectorSource: 'computed' as const };
  },
});

// Étape 3 : calcule S_AB (similarité cosinus), la rétention R_AB(t) avec un
// taux d'oubli lambda_AB flexibilisé par l'affinité sémantique, puis
// l'intensité I_AB(t) = alpha·S_AB + beta·R_AB(t) + gamma·F_AB de chaque lien.
export const computeIntensityMatrixStep = createStep({
  id: 'compute-intensity-matrix',
  description:
    "Calcule S_AB, la rétention R_AB(t) et l'intensité I_AB(t) de chaque lien rhizomatique, avec un taux d'oubli flexibilisé par l'affinité sémantique.",
  inputSchema: CorpusWithVectorsSchema,
  outputSchema: AdjacencyMatrixSchema,
  execute: async ({ inputData }) => {
    const vectorById = new Map(inputData.nodesWithVectors.map((n) => [n.id, n]));
    const state = await loadRetentionState();

    const edges = inputData.edgeCandidates.map((edge) => {
      const source = vectorById.get(edge.sourceId);
      const target = vectorById.get(edge.targetId);
      if (!source || !target) {
        throw new Error(`Vecteur manquant pour le lien ${edge.id} (${edge.sourceId} -> ${edge.targetId})`);
      }
      return computeEdge(edge, source.vector, target.vector, inputData.now, state);
    });

    await saveRetentionState(state);

    return {
      generatedAt: inputData.now,
      windowLabel: inputData.windowLabel,
      dimension: 'pretopological-intensity' as const,
      coefficients: buildCoefficients(),
      nodes: inputData.nodesWithVectors.map((n) => ({ id: n.id, label: n.label })),
      edges,
    };
  },
});

// Étape 4 : le point de passage de relais vers le script Python/Qiskit
// (marche quantique / QAOA) — hors scope de ce workflow.
export const writeMatrixStep = createStep({
  id: 'write-matrix',
  description:
    "Écrit la matrice d'adjacence pondérée sur disque : c'est le point de passage de relais vers le script Python/Qiskit d'exploration quantique.",
  inputSchema: AdjacencyMatrixSchema,
  outputSchema: z.object({
    filePath: z.string(),
    latestFilePath: z.string(),
    nodeCount: z.number(),
    edgeCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { filePath, latestFilePath } = await writeMatrixFile(inputData);
    return { filePath, latestFilePath, nodeCount: inputData.nodes.length, edgeCount: inputData.edges.length };
  },
});

export const rhizomaticIntensityWorkflow = createWorkflow({
  id: 'rhizomatic-intensity-workflow',
  description:
    "Dimension prétopologique — dynamique rhizomatique : calcule la matrice d'adjacence pondérée par intensité de liens (affinité sémantique + rétention temporelle flexible) pour l'écosystème de connaissance de Gilles Deleuze.",
  inputSchema: triggerSchema,
  outputSchema: writeMatrixStep.outputSchema,
})
  .then(loadCorpusStep)
  .map(async ({ inputData }) => inputData.nodes)
  .foreach(ensureNodeEmbeddingStep, { concurrency: 4 })
  .map(async ({ inputData, getStepResult }) => {
    const corpus = getStepResult(loadCorpusStep);
    return {
      windowLabel: corpus.windowLabel,
      now: corpus.now,
      edgeCandidates: corpus.edgeCandidates,
      nodesWithVectors: inputData,
    };
  })
  .then(computeIntensityMatrixStep)
  .then(writeMatrixStep)
  .commit();
