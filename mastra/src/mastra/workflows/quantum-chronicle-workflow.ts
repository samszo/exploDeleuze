import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { loadCorpusStep, ensureNodeEmbeddingStep, computeIntensityMatrixStep } from './rhizomatic-intensity-workflow';
import { writeMatrixFile } from '../lib/adjacency-matrix';
import { intensityToTheta, runQuantumWalk, type QuantumEdgeInput } from '../lib/quantum-client';
import { omekaClient } from '../lib/omeka-client';
import { getEmbedding } from '../lib/embeddings-client';
import { chroniqueurCognitifAgent } from '../agents/chroniqueur-cognitif';
import {
  AdjacencyMatrixSchema,
  QuantumWalkResultSchema,
  AgentContextSchema,
  MarkdownDraftSchema,
  ChronicleDraftSchema,
  type AgentContext,
} from '../lib/schemas';

// Pipeline complet du diagramme d'architecture. Réutilise les trois premières
// étapes du workflow prétopologique (extraction, embeddings, calcul de
// I_AB(t)) puis enchaîne : marche quantique -> synthèse par l'Agent Mastra ->
// vectorisation -> écriture d'un nouvel Item dans Omeka S.
const triggerSchema = z.object({
  windowLabel: z.string().default('default'),
  // Le nœud depuis lequel la marche quantique part explorer le rhizome.
  sourceId: z.string(),
});

// Écrit un instantané de la matrice sur disque (traçabilité), puis transmet
// la matrice complète (et non un simple résumé) à l'étape quantique.
const persistMatrixSnapshotStep = createStep({
  id: 'persist-matrix-snapshot',
  description: "Écrit un instantané de la matrice d'adjacence sur disque avant de la transmettre à la marche quantique.",
  inputSchema: AdjacencyMatrixSchema,
  outputSchema: AdjacencyMatrixSchema,
  execute: async ({ inputData }) => {
    await writeMatrixFile(inputData);
    return inputData;
  },
});

// Étapes 2 à 5 du diagramme : dérive un angle theta de chaque I_AB, envoie
// nœuds + arêtes au micro-service quantique (FastAPI/Qiskit Aer, ou son
// repli classique synthétique), et récupère les concepts résonnants.
const runQuantumWalkStep = createStep({
  id: 'run-quantum-walk',
  description:
    "Envoie les angles Theta (dérivés de I_AB) et les arêtes au micro-service quantique, qui construit et exécute l'ansatz puis renvoie les concepts résonnants.",
  inputSchema: z.object({ matrix: AdjacencyMatrixSchema, sourceId: z.string() }),
  outputSchema: QuantumWalkResultSchema,
  execute: async ({ inputData }) => {
    const { matrix, sourceId } = inputData;
    if (!matrix.nodes.some((n) => n.id === sourceId)) {
      throw new Error(`sourceId '${sourceId}' absent du sous-graphe calculé pour cette fenêtre`);
    }

    const edges: QuantumEdgeInput[] = matrix.edges.map((e) => ({
      source: e.sourceId,
      target: e.targetId,
      theta: intensityToTheta(e.I_AB),
    }));
    const nodeIds = matrix.nodes.map((n) => n.id);
    const { resonantConcepts } = await runQuantumWalk({ sourceId, nodeIds, edges });

    const labelById = new Map(matrix.nodes.map((n) => [n.id, n.label]));
    return {
      sourceId,
      windowLabel: matrix.windowLabel,
      matrix,
      resonantConcepts: resonantConcepts.map((rc) => ({
        id: rc.id,
        label: labelById.get(rc.id) ?? rc.id,
        probability: rc.probability,
      })),
    };
  },
});

// Étape 6 : rassemble le contexte source (texte complet) et le contexte
// quantique (concepts résonnants) transmis à l'Agent Mastra.
const buildAgentContextStep = createStep({
  id: 'build-agent-context',
  description: "Rassemble le texte complet du nœud source et les concepts résonnants identifiés, pour l'Agent Mastra.",
  inputSchema: QuantumWalkResultSchema,
  outputSchema: AgentContextSchema,
  execute: async ({ inputData }) => {
    const source = await omekaClient.getItem(inputData.sourceId);
    return {
      sourceId: inputData.sourceId,
      sourceLabel: source.label,
      sourceText: source.text,
      resonantConcepts: inputData.resonantConcepts,
    };
  },
});

function buildChroniclePrompt(context: AgentContext): string {
  const resonantList = context.resonantConcepts
    .map((c) => `- ${c.label} (id: ${c.id}, résonance : ${(c.probability * 100).toFixed(1)}%)`)
    .join('\n');
  return [
    `Nœud source : ${context.sourceLabel} (id: ${context.sourceId})`,
    '',
    'Texte du nœud source :',
    context.sourceText,
    '',
    'Concepts résonnants identifiés par la marche quantique :',
    resonantList,
    '',
    'Rédige la note de synthèse Markdown demandée.',
  ].join('\n');
}

// Les petits modèles auto-hébergés gèrent parfois mal l'appel d'outil
// structuré : ils laissent fuiter leurs tentatives sous forme de JSON brut en
// tête de réponse, et enveloppent parfois tout le texte dans un bloc de code.
// On ne fait pas confiance à response.text tel quel : on isole la vraie note
// en repartant de son premier titre Markdown, et on retire les clôtures de
// bloc de code orphelines.
function sanitizeMarkdown(raw: string): string {
  let text = raw.trim();

  const headingIndex = text.search(/^#\s+.+$/m);
  if (headingIndex > 0) {
    text = text.slice(headingIndex).trim();
  }

  text = text.replace(/^```[a-z]*\n/i, '').trim();
  text = text.replace(/\n?```\s*$/, '').trim();

  return text;
}

// Étape 7 : l'Agent Mastra ("Chroniqueur Cognitif") génère la note Markdown.
const generateMarkdownStep = createStep({
  id: 'generate-markdown',
  description: "L'Agent Mastra (Chroniqueur Cognitif) rédige la note de synthèse en Markdown à partir du contexte source + quantique.",
  inputSchema: AgentContextSchema,
  outputSchema: MarkdownDraftSchema,
  execute: async ({ inputData }) => {
    const response = await chroniqueurCognitifAgent.generate(buildChroniclePrompt(inputData));
    const markdown = sanitizeMarkdown(response.text);

    // Un modèle auto-hébergé faible peut ne produire aucun contenu
    // exploitable (juste des tentatives d'appel d'outil non abouties). Mieux
    // vaut faire échouer le workflow bruyamment que d'écrire un item corrompu
    // (sans titre réel) dans Omeka S.
    if (!/^#\s+.+/m.test(markdown)) {
      throw new Error(
        `Le Chroniqueur Cognitif n'a pas produit de note Markdown exploitable (aucun titre de niveau 1 détecté). Réponse brute du modèle : ${response.text.slice(0, 500)}`,
      );
    }

    return { ...inputData, markdown };
  },
});

// Étapes 8-9 : le Markdown généré est vectorisé via le même client
// d'embeddings (TEI/BGE-m3, ou synthétique) que les nœuds du rhizome.
const embedMarkdownStep = createStep({
  id: 'embed-markdown',
  description: 'Calcule le vecteur final (V_texte) de la note Markdown générée.',
  inputSchema: MarkdownDraftSchema,
  outputSchema: ChronicleDraftSchema,
  execute: async ({ inputData }) => {
    const vector = await getEmbedding(inputData.markdown);
    return {
      sourceId: inputData.sourceId,
      resonantConceptIds: inputData.resonantConcepts.map((c) => c.id),
      markdown: inputData.markdown,
      vector,
    };
  },
});

function deriveTitle(markdown: string): string {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  const firstLine = markdown.split('\n').find((line) => line.trim().length > 0);
  return firstLine?.trim().slice(0, 120) ?? 'Chronique sans titre';
}

// Étape 10 : création de l'Item dans Omeka S (Markdown + V_final +
// dcterms:isVersionOf vers le nœud source et les concepts résonnants).
const createChronicleItemStep = createStep({
  id: 'create-chronicle-item',
  description: "Crée le nouvel Item Omeka S : Markdown + vecteur final + relations dcterms:isVersionOf vers les nœuds d'origine.",
  inputSchema: ChronicleDraftSchema,
  outputSchema: z.object({
    itemId: z.string(),
    title: z.string(),
    isVersionOf: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const isVersionOf = [inputData.sourceId, ...inputData.resonantConceptIds];
    const title = deriveTitle(inputData.markdown);
    const itemId = await omekaClient.createItem({
      label: title,
      markdown: inputData.markdown,
      vector: inputData.vector,
      isVersionOf,
    });
    return { itemId, title, isVersionOf };
  },
});

export const quantumChronicleWorkflow = createWorkflow({
  id: 'quantum-chronicle-workflow',
  description:
    "Pipeline complet : extraction Omeka S -> marche quantique (FastAPI/Qiskit Aer) -> synthèse Markdown par l'Agent Mastra -> vectorisation -> création d'un nouvel Item Omeka S relié par dcterms:isVersionOf.",
  inputSchema: triggerSchema,
  outputSchema: createChronicleItemStep.outputSchema,
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
  .then(persistMatrixSnapshotStep)
  .map(async ({ inputData, getInitData }) => ({
    matrix: inputData,
    sourceId: (getInitData() as z.infer<typeof triggerSchema>).sourceId,
  }))
  .then(runQuantumWalkStep)
  .then(buildAgentContextStep)
  .then(generateMarkdownStep)
  .then(embedMarkdownStep)
  .then(createChronicleItemStep)
  .commit();
