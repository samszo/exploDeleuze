import { OMK_BASE, API_BASE } from "./config.js";
import { authQuery } from "./auth.js";

export function mediaUrl(source) {
  return `${OMK_BASE}/${source}`;
}

let conferencesCache = null;

export async function fetchConferences() {
  if (conferencesCache) return conferencesCache;
  conferencesCache = (async () => {
    //const res = await fetch(`${API_BASE}/listconferences`);
    const res = await fetch(`./data/listconferences.json`);
    if (!res.ok) throw new Error(`listconferences: HTTP ${res.status}`);
    return res.json();
  })().catch((err) => {
    conferencesCache = null;
    throw err;
  });
  return conferencesCache;
}

export async function fetchSearchResults(trouve) {
  const res = await fetch(`${API_BASE}/cherche?trouve=${encodeURIComponent(trouve)}`);
  if (!res.ok) throw new Error(`cherche: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.transcriptions;
}

export async function fetchTranscriptions(idConf) {
  const res = await fetch(`${API_BASE}/transcriptions?idConf=${encodeURIComponent(idConf)}`);
  if (!res.ok) throw new Error(`transcriptions: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  // les fragments doivent s'enchaîner dans l'ordre chronologique du cours
  data.transcriptions.sort((a, b) => (a.face+'_'+a.plage+'_'+a.start) - (b.face+'_'+b.plage+'_'+b.start));
  return data.transcriptions;
}

// signale une correction/référence à trier plus tard dans l'admin Omeka.
export async function signalerFragment({ idConf, idTrans, type, texte, timecode, lien, auth }) {
  const params = new URLSearchParams({ idConf, idTrans, type, texte });
  if (lien) params.set("lien", lien);
  if (timecode != null) params.set("timecode", timecode);
  const res = await fetch(`${API_BASE}/signaler?${params.toString()}&${authQuery(auth)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `signaler: HTTP ${res.status}`);
  return data;
}

// relance la transcription d'un fragment avec un autre modèle (job Omeka).
export async function relancerTranscription({ idFrag, modele, auth }) {
  const params = new URLSearchParams({ idFrag, modele });
  const res = await fetch(`${API_BASE}/relancer?${params.toString()}&${authQuery(auth)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `relancer: HTTP ${res.status}`);
  return data;
}
