// Historique d'écoute (par cours) : mémorise le dernier fragment atteint et la
// position de lecture au sein de ce fragment, pour proposer de reprendre l'écoute.
// Purement local à l'appareil (localStorage), aucune synchronisation entre appareils.

const STORAGE_KEY = "flux-conceptuel-history";
const MAX_ENTRIES = 20;

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // stockage indisponible (navigation privée, quota…) : on continue sans historique
  }
}

// Enregistre la position atteinte dans un cours. Rappelée souvent (changement de
// fragment, pause, mise en arrière-plan) : ne doit rien faire de coûteux.
export function saveProgress(idConf, idTrans, position) {
  if (idConf == null || idTrans == null) return;
  const history = readHistory();
  history[idConf] = { idTrans, position: Math.max(0, position || 0), updatedAt: Date.now() };

  const entries = Object.entries(history).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  writeHistory(Object.fromEntries(entries.slice(0, MAX_ENTRIES)));
}

export function getProgress(idConf) {
  if (idConf == null) return null;
  return readHistory()[idConf] || null;
}

export function removeProgress(idConf) {
  const history = readHistory();
  delete history[idConf];
  writeHistory(history);
}

// Historique trié du plus récent au plus ancien : [{ idConf, idTrans, position, updatedAt }]
export function getRecentHistory() {
  return Object.entries(readHistory())
    .map(([idConf, entry]) => ({ idConf: Number(idConf), ...entry }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
