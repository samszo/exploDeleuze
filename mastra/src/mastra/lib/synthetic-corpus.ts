// Corpus synthétique (Phase 1 : bac à sable) — un petit rhizome de concepts
// deleuziens, avec des liens de base plats et statiques, tel que le décrit le
// document de conception avant le branchement des logs d'interaction réels.
export interface SyntheticNode {
  id: string;
  label: string;
  text: string;
}

export const SYNTHETIC_NODES: SyntheticNode[] = [
  {
    id: 'rhizome',
    label: 'Rhizome',
    text: "Le rhizome est une structure horizontale sans début ni fin, connectant tout point à tout autre point, et s'oppose à la pensée arborescente hiérarchique.",
  },
  {
    id: 'ligne-de-fuite',
    label: 'Ligne de fuite',
    text: "La ligne de fuite est une trajectoire de déterritorialisation, un point de rupture où l'agencement bascule vers une nouvelle configuration.",
  },
  {
    id: 'agencement-machinique',
    label: 'Agencement machinique',
    text: "Un agencement machinique articule des corps hétérogènes, humains et non-humains, dans une production de désir et d'action collective.",
  },
  {
    id: 'corps-sans-organes',
    label: 'Corps sans organes',
    text: "Le corps sans organes est un plan d'intensités pures, un champ d'immanence antérieur à toute organisation stratifiée.",
  },
  {
    id: 'devenir',
    label: 'Devenir',
    text: "Le devenir est un processus de transformation continue, un devenir-animal ou devenir-imperceptible qui échappe aux identités fixes.",
  },
  {
    id: 'plan-d-immanence',
    label: "Plan d'immanence",
    text: "Le plan d'immanence est le sol préphilosophique sur lequel les concepts sont créés, sans transcendance extérieure.",
  },
  {
    id: 'difference-et-repetition',
    label: 'Différence et répétition',
    text: "La différence en soi précède l'identité ; la répétition n'est jamais du même mais produit du nouveau à chaque itération.",
  },
  {
    id: 'pli',
    label: 'Pli',
    text: "Le pli est l'opération baroque qui courbe la matière et l'âme, créant des replis infinis entre intérieur et extérieur.",
  },
  {
    id: 'deterritorialisation',
    label: 'Déterritorialisation',
    text: "La déterritorialisation arrache un agencement à son territoire pour ouvrir de nouveaux possibles, souvent suivie d'une reterritorialisation.",
  },
  {
    id: 'multiplicite',
    label: 'Multiplicité',
    text: "Une multiplicité rhizomatique varie en nature à mesure qu'elle change de dimensions, sans unité préalable à diviser.",
  },
  {
    id: 'intensite',
    label: 'Intensité',
    text: "L'intensité est une différence de potentiel pure, une grandeur non extensive qui engendre la sensation et le mouvement.",
  },
  {
    id: 'retention-tertiaire',
    label: 'Rétention tertiaire',
    text: "La rétention tertiaire, empruntée à Stiegler, désigne les traces mnésiques externalisées dans des supports techniques qui organisent la mémoire collective.",
  },
  {
    id: 'espace-strie',
    label: 'Espace strié',
    text: "L'espace strié est quadrillé, mesurable, organisé par des coordonnées fixes, propre à l'appareil d'État.",
  },
  {
    id: 'espace-lisse',
    label: 'Espace lisse',
    text: "L'espace lisse est continu, non métrique, parcouru par des trajectoires nomades sans point fixe.",
  },
  {
    id: 'machine-de-guerre',
    label: 'Machine de guerre',
    text: "La machine de guerre nomade s'oppose à l'appareil d'État : elle invente sans se laisser capturer par les structures hiérarchiques.",
  },
  {
    id: 'conatus',
    label: 'Conatus',
    text: "Le conatus spinoziste est l'effort par lequel chaque chose persévère dans son être, augmentant ou diminuant sa puissance d'agir.",
  },
];

// Liens rhizomatiques de base (voisinages prétopologiques, non dirigés pour ce
// prototype) — le graphe "plat et statique" avant pondération par intensité.
export const SYNTHETIC_BASE_EDGES: [string, string][] = [
  ['rhizome', 'multiplicite'],
  ['rhizome', 'ligne-de-fuite'],
  ['rhizome', 'agencement-machinique'],
  ['rhizome', 'espace-lisse'],
  ['ligne-de-fuite', 'deterritorialisation'],
  ['ligne-de-fuite', 'devenir'],
  ['ligne-de-fuite', 'machine-de-guerre'],
  ['agencement-machinique', 'corps-sans-organes'],
  ['agencement-machinique', 'plan-d-immanence'],
  ['corps-sans-organes', 'intensite'],
  ['corps-sans-organes', 'plan-d-immanence'],
  ['corps-sans-organes', 'conatus'],
  ['devenir', 'multiplicite'],
  ['devenir', 'intensite'],
  ['plan-d-immanence', 'difference-et-repetition'],
  ['difference-et-repetition', 'intensite'],
  ['difference-et-repetition', 'retention-tertiaire'],
  ['pli', 'espace-lisse'],
  ['pli', 'difference-et-repetition'],
  ['deterritorialisation', 'espace-lisse'],
  ['deterritorialisation', 'espace-strie'],
  ['multiplicite', 'intensite'],
  ['espace-strie', 'machine-de-guerre'],
  ['espace-lisse', 'machine-de-guerre'],
  ['conatus', 'intensite'],
];

export function edgeId(a: string, b: string): string {
  return [a, b].sort().join('--');
}

function buildAdjacencyList(edges: [string, string][]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of edges) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }
  return adjacency;
}

export interface ExplorerSimulationOptions {
  agents: number;
  steps: number;
  seed?: number;
}

// Simule des agents "lecteurs" qui parcourent le rhizome pour produire une
// trace d'usage plausible (Phase 1 du document de conception, avant le
// branchement des logs d'interaction réels de l'écosystème). Générateur
// congruentiel linéaire simple pour des exécutions déterministes et
// reproductibles à seed égale.
export function simulateExplorerTraversals(
  edges: [string, string][],
  options: ExplorerSimulationOptions,
): Map<string, number> {
  const adjacency = buildAdjacencyList(edges);
  const nodeIds = [...adjacency.keys()];
  const counts = new Map<string, number>();
  if (nodeIds.length === 0) return counts;

  let seed = options.seed ?? 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let a = 0; a < options.agents; a++) {
    let current = nodeIds[Math.floor(rand() * nodeIds.length)];
    for (let s = 0; s < options.steps; s++) {
      const neighbors = adjacency.get(current) ?? [];
      if (neighbors.length === 0) break;
      const next = neighbors[Math.floor(rand() * neighbors.length)];
      const id = edgeId(current, next);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      current = next;
    }
  }
  return counts;
}
