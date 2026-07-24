import { cosineSimilarity } from './embeddings-client';
import { computeDecayRate, computeIntensity, updateRetention, type RetentionState } from './rhizome-intensity';
import { env } from './env';
import type { AdjacencyMatrixEdge, EdgeCandidate } from './schemas';

// Calcule (et fait muter `state`) l'intensité I_AB(t) d'un lien rhizomatique,
// partagé entre le workflow de calcul complet et le workflow réactif.
export function computeEdge(
  edge: EdgeCandidate,
  sourceVector: number[],
  targetVector: number[],
  now: string,
  state: RetentionState,
): AdjacencyMatrixEdge {
  const sAB = cosineSimilarity(sourceVector, targetVector);
  const lambdaAB = computeDecayRate(sAB);

  const previousEntry = state[edge.id];
  const deltaTHours = previousEntry
    ? Math.max(0, (new Date(now).getTime() - new Date(previousEntry.updatedAt).getTime()) / 3_600_000)
    : 0;
  const deltaI = edge.traversalCount * env.rhizome.traversalIncrement;
  const rAB = updateRetention(previousEntry?.R ?? 0, lambdaAB, deltaTHours, deltaI);

  const fAB = edge.contextualWeight ?? 0;
  const iAB = computeIntensity(sAB, rAB, fAB);

  state[edge.id] = { R: rAB, updatedAt: now };

  return {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    S_AB: sAB,
    lambda_AB: lambdaAB,
    R_AB: rAB,
    F_AB: fAB,
    I_AB: iAB,
    traversalCount: edge.traversalCount,
    updatedAt: now,
  };
}
