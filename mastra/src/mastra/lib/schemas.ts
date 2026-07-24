import { z } from 'zod';

// Un nœud de l'écosystème de connaissance (concept, ressource, fiche de lecture...)
// tel qu'extrait du socle Omeka S (ou du corpus synthétique en Phase 1).
export const KnowledgeNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  existingVector: z.array(z.number()).optional(),
});

export const NodeWithVectorSchema = z.object({
  id: z.string(),
  label: z.string(),
  vector: z.array(z.number()),
  vectorSource: z.enum(['cached', 'computed']),
});

// Un lien candidat de la dimension prétopologique, avant calcul de son intensité.
// traversalCount = nombre de passages observés (ou simulés) dans la fenêtre courante.
export const EdgeCandidateSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  traversalCount: z.number().nonnegative(),
  contextualWeight: z.number().min(0).max(1).default(0),
});

export const CorpusSchema = z.object({
  windowLabel: z.string(),
  now: z.string(),
  nodes: z.array(KnowledgeNodeSchema),
  edgeCandidates: z.array(EdgeCandidateSchema),
});

export const CorpusWithVectorsSchema = z.object({
  windowLabel: z.string(),
  now: z.string(),
  edgeCandidates: z.array(EdgeCandidateSchema),
  nodesWithVectors: z.array(NodeWithVectorSchema),
});

// Une arête de la matrice finale : I_AB(t) = alpha·S_AB + beta·R_AB(t) + gamma·F_AB
export const AdjacencyMatrixEdgeSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  S_AB: z.number(),
  lambda_AB: z.number(),
  R_AB: z.number(),
  F_AB: z.number(),
  I_AB: z.number(),
  traversalCount: z.number(),
  updatedAt: z.string(),
});

// Le document de passage de relais vers le script Python/Qiskit (QAOA / marche quantique).
export const AdjacencyMatrixSchema = z.object({
  generatedAt: z.string(),
  windowLabel: z.string(),
  dimension: z.literal('pretopological-intensity'),
  coefficients: z.object({
    alpha: z.number(),
    beta: z.number(),
    gamma: z.number(),
    lambdaBase: z.number(),
    kappa: z.number(),
  }),
  nodes: z.array(z.object({ id: z.string(), label: z.string() })),
  edges: z.array(AdjacencyMatrixEdgeSchema),
});

// Un concept identifié comme résonnant par la marche quantique (étape 5 du
// diagramme), avec sa probabilité marginale de résonance.
export const ResonantConceptSchema = z.object({
  id: z.string(),
  label: z.string(),
  probability: z.number(),
});

export const QuantumWalkResultSchema = z.object({
  sourceId: z.string(),
  windowLabel: z.string(),
  matrix: AdjacencyMatrixSchema,
  resonantConcepts: z.array(ResonantConceptSchema),
});

export const AgentContextSchema = z.object({
  sourceId: z.string(),
  sourceLabel: z.string(),
  sourceText: z.string(),
  resonantConcepts: z.array(ResonantConceptSchema),
});

export const MarkdownDraftSchema = AgentContextSchema.extend({
  markdown: z.string(),
});

export const ChronicleDraftSchema = z.object({
  sourceId: z.string(),
  resonantConceptIds: z.array(z.string()),
  markdown: z.string(),
  vector: z.array(z.number()),
});

export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;
export type NodeWithVector = z.infer<typeof NodeWithVectorSchema>;
export type EdgeCandidate = z.infer<typeof EdgeCandidateSchema>;
export type AdjacencyMatrixEdge = z.infer<typeof AdjacencyMatrixEdgeSchema>;
export type AdjacencyMatrix = z.infer<typeof AdjacencyMatrixSchema>;
export type ResonantConcept = z.infer<typeof ResonantConceptSchema>;
export type QuantumWalkResult = z.infer<typeof QuantumWalkResultSchema>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type MarkdownDraft = z.infer<typeof MarkdownDraftSchema>;
export type ChronicleDraft = z.infer<typeof ChronicleDraftSchema>;
