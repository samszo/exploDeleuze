import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from './env';
import type { AdjacencyMatrix, AdjacencyMatrixEdge } from './schemas';

const OUTPUT_DIR = path.join(env.dataDir, 'adjacency-matrix');

export function buildCoefficients() {
  return {
    alpha: env.rhizome.alpha,
    beta: env.rhizome.beta,
    gamma: env.rhizome.gamma,
    lambdaBase: env.rhizome.lambdaBase,
    kappa: env.rhizome.kappa,
  };
}

// Écrit la matrice d'adjacence pondérée sur disque : c'est le point de
// passage de relais vers le script Python/Qiskit d'exploration quantique
// (marche quantique / QAOA), volontairement hors scope de ce workflow.
export async function writeMatrixFile(matrix: AdjacencyMatrix): Promise<{ filePath: string; latestFilePath: string }> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const timestamp = matrix.generatedAt.replace(/[:.]/g, '-');
  const filePath = path.join(OUTPUT_DIR, `${matrix.windowLabel}-${timestamp}.json`);
  const latestFilePath = path.join(OUTPUT_DIR, 'latest.json');
  const serialized = JSON.stringify(matrix, null, 2);
  await fs.writeFile(filePath, serialized, 'utf-8');
  await fs.writeFile(latestFilePath, serialized, 'utf-8');
  return { filePath, latestFilePath };
}

export async function readLatestMatrix(): Promise<AdjacencyMatrix | undefined> {
  try {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, 'latest.json'), 'utf-8');
    return JSON.parse(raw) as AdjacencyMatrix;
  } catch {
    return undefined;
  }
}

// Fusionne des arêtes recalculées (boucle réactive) dans la matrice existante,
// sans repasser par un recalcul complet du corpus.
export function mergeEdgesIntoMatrix(
  base: AdjacencyMatrix | undefined,
  windowLabel: string,
  generatedAt: string,
  nodeLabelsById: Map<string, string>,
  updatedEdges: AdjacencyMatrixEdge[],
): AdjacencyMatrix {
  const edgesById = new Map((base?.edges ?? []).map((e) => [e.id, e]));
  for (const edge of updatedEdges) edgesById.set(edge.id, edge);

  const nodesById = new Map((base?.nodes ?? []).map((n) => [n.id, n]));
  for (const [id, label] of nodeLabelsById) nodesById.set(id, { id, label });

  return {
    generatedAt,
    windowLabel,
    dimension: 'pretopological-intensity',
    coefficients: buildCoefficients(),
    nodes: [...nodesById.values()],
    edges: [...edgesById.values()],
  };
}
