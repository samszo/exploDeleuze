import { env } from './env';

const SYNTHETIC_DIMENSION = 64;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Embedding déterministe par hachage de sac-de-mots (bag-of-words), utilisé pour
// faire tourner tout le pipeline sans dépendre d'un serveur TEI/BGE-m3 réel.
// Deux textes partageant des tokens obtiennent une similarité cosinus plus élevée,
// ce qui suffit à valider la chaîne de calcul avant de brancher le vrai modèle.
function syntheticEmbedding(text: string): number[] {
  const vector = new Array(SYNTHETIC_DIMENSION).fill(0);
  const tokens = text.toLowerCase().match(/[a-zà-öø-ÿ0-9]+/g) ?? [];
  for (const token of tokens) {
    const bucket = hashToken(token) % SYNTHETIC_DIMENSION;
    vector[bucket] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

// Cf. doc de conception : POST http://localhost:8080/embed vers un serveur
// Text Embeddings Inference chargé avec BAAI/bge-m3.
async function teiEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${env.teiBaseUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: text }),
  });
  if (!response.ok) {
    throw new Error(`Le serveur TEI a répondu ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as number[][];
  return data[0];
}

export async function getEmbedding(text: string): Promise<number[]> {
  return env.embeddingsProvider === 'tei' ? teiEmbedding(text) : syntheticEmbedding(text);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
