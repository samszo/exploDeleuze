import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from './env';

export interface RetentionEntry {
  R: number;
  updatedAt: string;
}

// La mémoire du rhizome : la rétention R_AB par lien, mise en cache côté
// orchestration classique (Omeka S ne stocke que les embeddings, pas cet état
// dynamique — cf. discussion sur la couche de cache dans le document de conception).
export type RetentionState = Record<string, RetentionEntry>;

const STATE_PATH = path.join(env.dataDir, 'retention-state.json');

export async function loadRetentionState(): Promise<RetentionState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    return JSON.parse(raw) as RetentionState;
  } catch {
    return {};
  }
}

export async function saveRetentionState(state: RetentionState): Promise<void> {
  await fs.mkdir(env.dataDir, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// lambda_AB = lambda_base / (1 + kappa * S_AB)
// Un fort ancrage sémantique ralentit l'oubli du lien : il sédimente (espace
// strié) au lieu de s'effacer comme une ligne de fuite éphémère (espace lisse).
export function computeDecayRate(sAB: number): number {
  const { lambdaBase, kappa } = env.rhizome;
  return lambdaBase / (1 + kappa * sAB);
}

// R_AB(t) = R_AB(t-1) * e^(-lambda_AB * deltaT) + deltaI
export function updateRetention(previousR: number, lambdaAB: number, deltaTHours: number, deltaI: number): number {
  const decayed = previousR * Math.exp(-lambdaAB * deltaTHours);
  return decayed + deltaI;
}

// I_AB(t) = alpha * S_AB + beta * R_AB(t) + gamma * F_AB
export function computeIntensity(sAB: number, rAB: number, fAB: number): number {
  const { alpha, beta, gamma } = env.rhizome;
  return alpha * sAB + beta * rAB + gamma * fAB;
}
