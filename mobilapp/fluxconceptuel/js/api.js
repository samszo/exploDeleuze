import { OMK_BASE, API_BASE } from "./config.js";

export function mediaUrl(source) {
  return `${OMK_BASE}/${source}`;
}

let conferencesCache = null;

export async function fetchConferences() {
  if (conferencesCache) return conferencesCache;
  conferencesCache = (async () => {
    const res = await fetch(`${API_BASE}/listconferences`);
    if (!res.ok) throw new Error(`listconferences: HTTP ${res.status}`);
    return res.json();
  })().catch((err) => {
    conferencesCache = null;
    throw err;
  });
  return conferencesCache;
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
