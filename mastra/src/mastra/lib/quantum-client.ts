import { env } from './env';

export interface QuantumEdgeInput {
  source: string;
  target: string;
  theta: number;
}

export interface QuantumWalkInput {
  sourceId: string;
  nodeIds: string[];
  edges: QuantumEdgeInput[];
}

export interface QuantumWalkOutput {
  resonantConcepts: Array<{ id: string; probability: number }>;
}

// I_AB(t) est une intensité positive non bornée (la rétention R_AB peut
// s'accumuler indéfiniment sans plafond strict). On la fait saturer en
// douceur dans [0, π) via un arctangente avant de la fournir comme angle de
// rotation Ry(θ) au circuit quantique (cf. document de conception : "une
// intensité très forte se traduira par un angle de rotation important").
export function intensityToTheta(iAB: number): number {
  const clamped = Math.max(0, iAB);
  return (Math.atan(clamped) / (Math.PI / 2)) * Math.PI;
}

async function fastapiQuantumWalk(input: QuantumWalkInput): Promise<QuantumWalkOutput> {
  const response = await fetch(`${env.quantum.serviceUrl}/quantum/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId: input.sourceId,
      nodes: input.nodeIds,
      edges: input.edges,
      shots: env.quantum.shots,
      topK: env.quantum.topK,
    }),
  });
  if (!response.ok) {
    throw new Error(`Le micro-service quantique a répondu ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { resonantConcepts: Array<{ id: string; probability: number }> };
  return { resonantConcepts: data.resonantConcepts };
}

// Approximation classique déterministe de la marche quantique, utilisée
// lorsque QUANTUM_PROVIDER=synthetic (aucun micro-service requis). Diffuse
// une masse de probabilité depuis le nœud source le long des arêtes, avec une
// probabilité de transfert sin²(θ/2) — la même loi qu'une porte Ry(θ) donne
// pour l'amplitude de transition |0⟩ → |1⟩. Ce n'est pas une simulation
// quantique : c'est un solveur de repli pour exercer tout le pipeline TS
// (agent, embeddings, écriture Omeka S) sans dépendre du micro-service Python.
function syntheticQuantumWalk(input: QuantumWalkInput): QuantumWalkOutput {
  const adjacency = new Map<string, Array<{ neighbor: string; weight: number }>>();
  for (const id of input.nodeIds) adjacency.set(id, []);
  for (const edge of input.edges) {
    const transferWeight = Math.sin(edge.theta / 2) ** 2;
    adjacency.get(edge.source)?.push({ neighbor: edge.target, weight: transferWeight });
    adjacency.get(edge.target)?.push({ neighbor: edge.source, weight: transferWeight });
  }

  let distribution = new Map<string, number>(input.nodeIds.map((id) => [id, id === input.sourceId ? 1 : 0]));
  const stayProbability = 0.3;
  const steps = 4;

  for (let step = 0; step < steps; step++) {
    const next = new Map<string, number>(input.nodeIds.map((id) => [id, 0]));
    for (const [node, mass] of distribution) {
      if (mass === 0) continue;
      const neighbors = adjacency.get(node) ?? [];
      const totalWeight = neighbors.reduce((sum, n) => sum + n.weight, 0);
      next.set(node, (next.get(node) ?? 0) + mass * stayProbability);
      if (totalWeight > 0) {
        const transferable = mass * (1 - stayProbability);
        for (const { neighbor, weight } of neighbors) {
          next.set(neighbor, (next.get(neighbor) ?? 0) + transferable * (weight / totalWeight));
        }
      } else {
        next.set(node, (next.get(node) ?? 0) + mass * (1 - stayProbability));
      }
    }
    distribution = next;
  }

  const resonantConcepts = [...distribution.entries()]
    .filter(([id]) => id !== input.sourceId)
    .sort((a, b) => b[1] - a[1])
    .slice(0, env.quantum.topK)
    .map(([id, probability]) => ({ id, probability }));

  return { resonantConcepts };
}

export async function runQuantumWalk(input: QuantumWalkInput): Promise<QuantumWalkOutput> {
  return env.quantum.provider === 'fastapi' ? fastapiQuantumWalk(input) : syntheticQuantumWalk(input);
}
