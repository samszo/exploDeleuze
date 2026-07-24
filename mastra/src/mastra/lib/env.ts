import path from 'node:path';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  // `mastra dev` exécute le code depuis un répertoire bac-à-sable interne, où
  // process.cwd() ne correspond pas à la racine du projet. DATA_DIR permet de
  // fixer un emplacement stable pour les artefacts (matrice, état de
  // rétention, store synthétique) quel que soit le mode d'exécution.
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data'),

  omekaMode: (process.env.OMEKA_MODE ?? 'synthetic') as 'synthetic' | 'live',
  omekaBaseUrl: process.env.OMEKA_BASE_URL ?? '',
  omekaKeyIdentity: process.env.OMEKA_KEY_IDENTITY ?? '',
  omekaKeyCredential: process.env.OMEKA_KEY_CREDENTIAL ?? '',
  omekaEmbeddingPropertyId: num('OMEKA_EMBEDDING_PROPERTY_ID', 99),
  omekaEmbeddingPropertyTerm: process.env.OMEKA_EMBEDDING_PROPERTY_TERM ?? 'pretopo:embedding',
  // IDs internes des propriétés Dublin Core Terms — à vérifier dans votre
  // instance (Contenu > Vocabulaires), ils varient selon les installations.
  omekaTitlePropertyId: num('OMEKA_TITLE_PROPERTY_ID', 1),
  omekaDescriptionPropertyId: num('OMEKA_DESCRIPTION_PROPERTY_ID', 4),
  omekaIsVersionOfPropertyId: num('OMEKA_IS_VERSION_OF_PROPERTY_ID', 45),
  omekaWebhookSecret: process.env.OMEKA_WEBHOOK_SECRET ?? '',

  embeddingsProvider: (process.env.EMBEDDINGS_PROVIDER ?? 'synthetic') as 'synthetic' | 'tei',
  teiBaseUrl: process.env.TEI_BASE_URL ?? 'http://localhost:8080',

  // I_AB(t) = alpha * S_AB + beta * R_AB(t) + gamma * F_AB
  rhizome: {
    alpha: num('RHIZOME_ALPHA', 0.4),
    beta: num('RHIZOME_BETA', 0.5),
    gamma: num('RHIZOME_GAMMA', 0.1),
    lambdaBase: num('RHIZOME_LAMBDA_BASE', 0.15),
    kappa: num('RHIZOME_KAPPA', 4),
    traversalIncrement: num('RHIZOME_TRAVERSAL_INCREMENT', 0.2),
  },

  synthetic: {
    explorerAgents: num('SYNTHETIC_EXPLORER_AGENTS', 6),
    explorerSteps: num('SYNTHETIC_EXPLORER_STEPS', 120),
  },

  // LLM auto-hébergé (Ollama, ou tout serveur exposant une API compatible
  // OpenAI) pour l'Agent Mastra "Chroniqueur Cognitif" — cf. décision de
  // souveraineté des données du document de conception.
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1',
    apiKey: process.env.LLM_API_KEY ?? 'ollama',
    model: process.env.LLM_MODEL ?? 'llama3',
  },

  // Micro-service Python FastAPI / Qiskit Aer (Espace Lisse — marche
  // quantique). synthetic : approximation classique locale (aucun service
  // requis) ; fastapi : appel HTTP réel au micro-service.
  quantum: {
    provider: (process.env.QUANTUM_PROVIDER ?? 'synthetic') as 'synthetic' | 'fastapi',
    serviceUrl: process.env.QUANTUM_SERVICE_URL ?? 'http://localhost:8000',
    shots: num('QUANTUM_SHOTS', 2048),
    topK: num('QUANTUM_TOP_K', 5),
  },
};
