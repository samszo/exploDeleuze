import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { SYNTHETIC_NODES, SYNTHETIC_BASE_EDGES, edgeId, simulateExplorerTraversals } from './synthetic-corpus';
import type { KnowledgeNode, EdgeCandidate } from './schemas';

const SYNTHETIC_STORE_PATH = path.join(env.dataDir, 'synthetic-omeka-store.json');

interface SyntheticCreatedItem {
  id: string;
  label: string;
  text: string;
  vector: number[];
  isVersionOf: string[];
  createdAt: string;
}

interface SyntheticStore {
  vectors: Record<string, number[]>;
  createdItems?: Record<string, SyntheticCreatedItem>;
}

async function loadSyntheticStore(): Promise<SyntheticStore> {
  try {
    const raw = await fs.readFile(SYNTHETIC_STORE_PATH, 'utf-8');
    return JSON.parse(raw) as SyntheticStore;
  } catch {
    return { vectors: {} };
  }
}

async function saveSyntheticStore(store: SyntheticStore): Promise<void> {
  await fs.mkdir(env.dataDir, { recursive: true });
  await fs.writeFile(SYNTHETIC_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

// Le corpus synthétique simule Omeka S avec un unique fichier JSON partagé.
// Sans verrou, des patchItemVector() concurrents (cf. .foreach concurrency et
// le script batch) entrelacent leurs cycles lecture-modification-écriture et
// se piétinent (mises à jour perdues, voire fichier JSON corrompu). Une vraie
// instance Omeka S n'a pas ce problème : chaque PATCH ne touche qu'une ligne.
let storeWriteQueue: Promise<unknown> = Promise.resolve();
async function withSyntheticStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = storeWriteQueue.then(fn, fn);
  storeWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function withCredentials(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}key_identity=${encodeURIComponent(env.omekaKeyIdentity)}&key_credential=${encodeURIComponent(env.omekaKeyCredential)}`;
}

function extractOmekaText(item: Record<string, unknown>): string {
  const descriptionArray = item['dcterms:description'] as Array<{ '@value'?: string }> | undefined;
  const description = descriptionArray?.[0]?.['@value'];
  const title = item['o:title'] as string | undefined;
  return [title, description].filter(Boolean).join('. ');
}

function extractOmekaVector(item: Record<string, unknown>): number[] | undefined {
  const propertyArray = item[env.omekaEmbeddingPropertyTerm] as Array<{ '@value'?: string }> | undefined;
  const raw = propertyArray?.[0]?.['@value'];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return undefined;
  }
}

function hashSeed(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return hash || 42;
}

// Passerelle vers le socle de connaissances. En OMEKA_MODE=synthetic, se
// comporte comme une instance Omeka S minimale (persistée en JSON local) pour
// pouvoir exécuter tout le pipeline sans service externe (Phase 1 du document
// de conception). En OMEKA_MODE=live, parle au vrai REST API d'Omeka S.
export class OmekaClient {
  async listItemsPage(page: number, perPage: number): Promise<{ items: KnowledgeNode[]; hasMore: boolean }> {
    if (env.omekaMode === 'synthetic') {
      const store = await loadSyntheticStore();
      const start = (page - 1) * perPage;
      const slice = SYNTHETIC_NODES.slice(start, start + perPage);
      return {
        items: slice.map((n) => ({ id: n.id, label: n.label, text: n.text, existingVector: store.vectors[n.id] })),
        hasMore: start + perPage < SYNTHETIC_NODES.length,
      };
    }

    const url = withCredentials(`${env.omekaBaseUrl}/items?page=${page}&per_page=${perPage}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Échec de la récupération des items Omeka S (page ${page}) : ${response.status} ${response.statusText}`);
    }
    const raw = (await response.json()) as Array<Record<string, unknown>>;
    const items: KnowledgeNode[] = raw.map((item) => ({
      id: String(item['o:id']),
      label: (item['o:title'] as string) ?? String(item['o:id']),
      text: extractOmekaText(item),
      existingVector: extractOmekaVector(item),
    }));
    return { items, hasMore: raw.length === perPage };
  }

  async getItem(id: string): Promise<KnowledgeNode> {
    if (env.omekaMode === 'synthetic') {
      const store = await loadSyntheticStore();
      const created = store.createdItems?.[id];
      if (created) {
        return { id: created.id, label: created.label, text: created.text, existingVector: created.vector };
      }
      const node = SYNTHETIC_NODES.find((n) => n.id === id);
      if (!node) throw new Error(`Nœud synthétique introuvable : ${id}`);
      return { id: node.id, label: node.label, text: node.text, existingVector: store.vectors[node.id] };
    }

    const url = withCredentials(`${env.omekaBaseUrl}/items/${id}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Échec de la récupération de l'item Omeka S ${id} : ${response.status} ${response.statusText}`);
    }
    const item = (await response.json()) as Record<string, unknown>;
    return {
      id: String(item['o:id']),
      label: (item['o:title'] as string) ?? String(item['o:id']),
      text: extractOmekaText(item),
      existingVector: extractOmekaVector(item),
    };
  }

  async patchItemVector(id: string, vector: number[]): Promise<void> {
    if (env.omekaMode === 'synthetic') {
      await withSyntheticStoreLock(async () => {
        const store = await loadSyntheticStore();
        store.vectors[id] = vector;
        await saveSyntheticStore(store);
      });
      return;
    }

    // Cf. doc de conception : injection du vecteur sous forme de Literal JSON
    // sur la propriété personnalisée (ex. pretopo:embedding).
    const payload = {
      [env.omekaEmbeddingPropertyTerm]: [
        {
          type: 'literal',
          property_id: env.omekaEmbeddingPropertyId,
          '@value': JSON.stringify(vector),
        },
      ],
    };

    const url = withCredentials(`${env.omekaBaseUrl}/items/${id}`);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Échec de l'injection du vecteur pour l'item ${id} : ${response.status} ${response.statusText}`);
    }
  }

  // Étape 10 du diagramme : crée un nouvel Item — la note du Chroniqueur
  // Cognitif — avec son Markdown, son vecteur final et ses liens
  // dcterms:isVersionOf vers le nœud source et les concepts résonnants.
  // Renvoie l'identifiant du nouvel item.
  async createItem(input: { label: string; markdown: string; vector: number[]; isVersionOf: string[] }): Promise<string> {
    if (env.omekaMode === 'synthetic') {
      return withSyntheticStoreLock(async () => {
        const store = await loadSyntheticStore();
        const id = `chronicle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        store.createdItems = store.createdItems ?? {};
        store.createdItems[id] = {
          id,
          label: input.label,
          text: input.markdown,
          vector: input.vector,
          isVersionOf: input.isVersionOf,
          createdAt: new Date().toISOString(),
        };
        store.vectors[id] = input.vector;
        await saveSyntheticStore(store);
        return id;
      });
    }

    const payload = {
      'dcterms:title': [
        {
          type: 'literal',
          property_id: env.omekaTitlePropertyId,
          '@value': input.label,
        },
      ],
      'dcterms:description': [
        {
          type: 'literal',
          property_id: env.omekaDescriptionPropertyId,
          '@value': input.markdown,
        },
      ],
      [env.omekaEmbeddingPropertyTerm]: [
        {
          type: 'literal',
          property_id: env.omekaEmbeddingPropertyId,
          '@value': JSON.stringify(input.vector),
        },
      ],
      'dcterms:isVersionOf': input.isVersionOf.map((sourceId) => ({
        type: 'resource',
        property_id: env.omekaIsVersionOfPropertyId,
        value_resource_id: sourceId,
      })),
    };

    const url = withCredentials(`${env.omekaBaseUrl}/items`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Échec de la création de l'item Omeka S : ${response.status} ${response.statusText}`);
    }
    const created = (await response.json()) as Record<string, unknown>;
    return String(created['o:id']);
  }

  // Liens de base de la dimension prétopologique + traversées de la fenêtre
  // courante. En synthétique : rhizome curé + agents explorateurs simulés
  // (Phase 1). En live : à brancher sur le vocabulaire relationnel Omeka S et
  // les logs d'interaction réels agrégés côté orchestration (Phase 2).
  async listBaseEdges(windowLabel: string): Promise<EdgeCandidate[]> {
    if (env.omekaMode === 'synthetic') {
      const traversals = simulateExplorerTraversals(SYNTHETIC_BASE_EDGES, {
        agents: env.synthetic.explorerAgents,
        steps: env.synthetic.explorerSteps,
        seed: hashSeed(windowLabel),
      });
      return SYNTHETIC_BASE_EDGES.map(([a, b]) => {
        const id = edgeId(a, b);
        return {
          id,
          sourceId: a,
          targetId: b,
          traversalCount: traversals.get(id) ?? 0,
          contextualWeight: 0,
        };
      });
    }

    throw new Error(
      "OMEKA_MODE=live nécessite une implémentation de listBaseEdges() adaptée à votre vocabulaire relationnel Omeka S et à vos logs d'interaction (Phase 2 du document de conception).",
    );
  }
}

export const omekaClient = new OmekaClient();
