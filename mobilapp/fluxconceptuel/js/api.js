import { OMK_BASE, API_BASE } from "./config.js?v=19";
import { authQuery } from "./auth.js?v=19";

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
export async function signalerFragment({ idConf, idTrans, type, texte, remplacer, par, surTout, timecode, lien, auth }) {
  const params = new URLSearchParams({ idConf, idTrans, type, texte });
  if (lien) params.set("lien", lien);
  if (timecode != null) params.set("timecode", timecode);
  if (remplacer != null) params.set("remplacer", remplacer);
  if (par != null) params.set("par", par);
  if (surTout != null) params.set("surTout", surTout ? "1" : "0");
  const res = await fetch(`${API_BASE}/signaler?${params.toString()}&${authQuery(auth)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `signaler: HTTP ${res.status}`);
  return data;
}

// liste les signalements (corrections / références) créés par l'utilisateur
// connecté : lit directement l'API cœur d'Omeka-S (pas besoin de passer par le
// module, dcterms:type identifie déjà nos signalements parmi ses items).
export async function fetchMesAnnotations(auth) {
  const params = new URLSearchParams({
    owner_id: auth.id,
    sort_by: "created",
    sort_order: "desc",
    per_page: "100",
  });
  params.set("property[0][property]", "dcterms:type");
  params.set("property[0][type]", "ex");
  const res = await fetch(`${OMK_BASE}/api/items?${params.toString()}&${authQuery(auth)}`);
  if (!res.ok) throw new Error(`mes annotations: HTTP ${res.status}`);
  return res.json();
}

// relance la transcription d'un fragment avec un autre modèle (job Omeka).
export async function relancerTranscription({ idFrag, modele, auth }) {
  const params = new URLSearchParams({ idFrag, modele });
  const res = await fetch(`${API_BASE}/relancer?${params.toString()}&${authQuery(auth)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `relancer: HTTP ${res.status}`);
  return data;
}
