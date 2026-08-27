import { md5ArrayBuffer } from "./md5.js";

const ZOTERO_API = "https://api.zotero.org";
const STORAGE_KEY = "flux-conceptuel-zotero";

function headers(auth, extra = {}) {
  return {
    "Zotero-API-Version": "3",
    "Zotero-API-Key": auth.apiKey,
    ...extra,
  };
}

export function getZoteroAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveZoteroAuth(userId, apiKey) {
  const auth = { userId, apiKey };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  return auth;
}

export function clearZoteroAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

// Vérifie la clé API en listant les bibliothèques accessibles (clés valides -> 200).
export async function checkZoteroAuth(auth) {
  const res = await fetch(`${ZOTERO_API}/users/${auth.userId}/items?limit=1`, {
    headers: headers(auth),
  });
  return res.ok;
}

function courseItemTitle(conf) {
  return `${conf.theme} — Cours ${conf.num} (${conf.created})`;
}

// Recherche un item déjà créé pour ce cours (comparaison exacte sur le champ url
// = lien catalogue BnF, le seul identifiant stable du cours). Sinon en crée un.
export async function findOrCreateCourseItem(auth, conf) {
  const searchUrl = `${ZOTERO_API}/users/${auth.userId}/items?q=${encodeURIComponent(conf.theme)}&qmode=titleCreatorYear&itemType=audioRecording`;
  const searchRes = await fetch(searchUrl, { headers: headers(auth) });
  if (searchRes.ok) {
    const items = await searchRes.json();
    const existing = items.find((it) => it.data && it.data.url === conf.source);
    if (existing) return existing.key;
  }

  const payload = [
    {
      itemType: "audioRecording",
      title: courseItemTitle(conf),
      date: conf.created,
      url: conf.source,
      libraryCatalog: "Catalogue BnF",
      extra: `Promotion ${conf.promo} · Thème : ${conf.theme}`,
      creators: [{ creatorType: "author", name: "Gilles Deleuze" }],
    },
  ];

  const createRes = await fetch(`${ZOTERO_API}/users/${auth.userId}/items`, {
    method: "POST",
    headers: headers(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!createRes.ok) throw new Error(`Zotero: création de l'item du cours (HTTP ${createRes.status})`);
  const result = await createRes.json();
  const created = result.successful && result.successful["0"];
  if (!created) throw new Error("Zotero: réponse inattendue à la création de l'item du cours");
  return created.key;
}

// Crée un item "audioRecording" dédié à un extrait précis (le seul type d'item
// Zotero qui porte les propriétés "Running Time" et "Label" utilisées ici pour la
// position dans le flux total et le texte transcrit). Relié à l'item du cours via
// dc:relation (référence à sens unique, pas de mise à jour de l'item du cours).
export async function createExtractItem(auth, { title, date, runningTime, label, url, courseItemKey, source }) {
  const payload = {
    itemType: "audioRecording",
    title,
    date: date || "",
    runningTime: runningTime || "",
    label: label || "",
    url: url || "",
    libraryCatalog: source,
    creators: [{ creatorType: "author", name: "Gilles Deleuze" }],
  };
  if (courseItemKey) {
    payload.relations = {
      "dc:relation": [`http://zotero.org/users/${auth.userId}/items/${courseItemKey}`],
    };
  }

  const res = await fetch(`${ZOTERO_API}/users/${auth.userId}/items`, {
    method: "POST",
    headers: headers(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify([payload]),
  });
  if (!res.ok) throw new Error(`Zotero: création de l'item de l'extrait (HTTP ${res.status})`);
  const result = await res.json();
  const created = result.successful && result.successful["0"];
  if (!created) throw new Error("Zotero: réponse inattendue à la création de l'item de l'extrait");
  return created.key;
}

function binaryStringToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

// Upload d'une pièce jointe fichier sur un item parent, selon le protocole en 3
// étapes de l'API Zotero (https://www.zotero.org/support/dev/web_api/v3/file_upload).
export async function uploadAttachment(auth, parentItemKey, blob, filename) {
  const fileBuffer = await blob.arrayBuffer();
  const md5 = md5ArrayBuffer(fileBuffer);
  const mtime = Date.now();
  const filesize = fileBuffer.byteLength;

  // 1. Crée l'item "attachment" (fichier importé, rattaché à l'item du cours).
  const createRes = await fetch(`${ZOTERO_API}/users/${auth.userId}/items`, {
    method: "POST",
    headers: headers(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify([
      {
        itemType: "attachment",
        linkMode: "imported_file",
        title: filename,
        filename,
        contentType: blob.type || "audio/wav",
        parentItem: parentItemKey,
        tags: [],
      },
    ]),
  });
  if (!createRes.ok) throw new Error(`Zotero: création de la pièce jointe (HTTP ${createRes.status})`);
  const createResult = await createRes.json();
  const created = createResult.successful && createResult.successful["0"];
  if (!created) throw new Error("Zotero: réponse inattendue à la création de la pièce jointe");
  const itemKey = created.key;

  // 2. Demande l'autorisation d'upload (ou détecte un fichier déjà stocké : {exists:1}).
  const authRes = await fetch(`${ZOTERO_API}/users/${auth.userId}/items/${itemKey}/file`, {
    method: "POST",
    headers: headers(auth, {
      "Content-Type": "application/x-www-form-urlencoded",
      "If-None-Match": "*",
    }),
    body: new URLSearchParams({ md5, filename, filesize: String(filesize), mtime: String(mtime) }),
  });
  if (!authRes.ok) throw new Error(`Zotero: autorisation d'upload refusée (HTTP ${authRes.status})`);
  const authData = await authRes.json();

  if (authData.exists) {
    return { itemKey, uploaded: false, alreadyStored: true };
  }

  // 3. Envoie le fichier à l'URL de stockage fournie (S3), en respectant le
  // préfixe/suffixe multipart imposés par Zotero.
  const uploadBody = new Blob([
    binaryStringToBytes(authData.prefix || ""),
    fileBuffer,
    binaryStringToBytes(authData.suffix || ""),
  ]);
  const uploadRes = await fetch(authData.url, {
    method: "POST",
    headers: { "Content-Type": authData.contentType },
    body: uploadBody,
  });
  if (!uploadRes.ok) throw new Error(`Zotero: envoi du fichier échoué (HTTP ${uploadRes.status})`);

  // 4. Confirme l'upload auprès de l'API Zotero.
  const registerRes = await fetch(`${ZOTERO_API}/users/${auth.userId}/items/${itemKey}/file`, {
    method: "POST",
    headers: headers(auth, {
      "Content-Type": "application/x-www-form-urlencoded",
      "If-None-Match": "*",
    }),
    body: new URLSearchParams({ upload: authData.uploadKey }),
  });
  if (!registerRes.ok) throw new Error(`Zotero: confirmation d'upload échouée (HTTP ${registerRes.status})`);

  return { itemKey, uploaded: true, alreadyStored: false };
}
