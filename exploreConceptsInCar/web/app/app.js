/* Flux Conceptuel — PWA hors-ligne.
 *
 * Rôle : parcourir le catalogue (via l'API du VPS), télécharger une séance
 * entière — métadonnées + transcriptions + fichiers audio Opus — dans le
 * navigateur (IndexedDB), puis l'écouter et la fouiller SANS connexion.
 *
 * L'API et les audios sont servis par la même origine que cette page
 * (web/ est le DocumentRoot du VPS, cette app vit dans web/app/), donc
 * les chemins /api/... et /audio/... sont relatifs et il n'y a pas de CORS.
 */
'use strict';

/* --- Fenêtre de rappel OAuth (popup de connexion Google) ---
 * La popup revient sur cette même URL avec #id_token=… ; on renvoie le jeton
 * à la fenêtre principale et on se ferme, sans démarrer l'app. */
if (window.opener && /[#&](id_token|error)=/.test(location.hash)) {
  const p = new URLSearchParams(location.hash.slice(1));
  try {
    window.opener.postMessage({
      __fluxOAuth: 1, id_token: p.get('id_token'), error: p.get('error'), state: p.get('state'),
    }, location.origin);
  } catch (_) { /* rien à faire */ }
  document.body && (document.body.textContent = 'Connexion… cette fenêtre va se fermer.');
  window.close();
  throw new Error('oauth-callback');   // stoppe le reste du script dans la popup
}

const API = '';                       // même origine que la page
const AVG_FRAG_KB = 133;              // ~3,7 Go / 27 674 fragments — pour l'estimation d'avant téléchargement
const DL_CONCURRENCY = 3;

/* ------------------------------------------------------------------ utils */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtHMS = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return (h ? h + ':' : '') + p(m) + ':' + p(s);
};
const fmtSize = (bytes) => {
  if (!bytes) return '0 Ko';
  const mo = bytes / 1048576;
  if (mo < 1) return Math.max(1, Math.round(bytes / 1024)) + ' Ko';
  return mo < 10 ? mo.toFixed(1) + ' Mo' : Math.round(mo) + ' Mo';
};
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
};

/* Repli d'accents en conservant l'index caractère par caractère (1:1 avec
 * le texte d'origine) — permet une recherche insensible aux accents ET un
 * surlignage aligné sur le texte affiché. */
const fold = (s) => [...(s || '')].map((ch) => {
  const d = ch.normalize('NFD');
  return (d.charCodeAt(0) ? d[0] : ch).toLowerCase();
}).join('');

let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = el('div', { className: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/* ------------------------------------------------------------- IndexedDB */
const DB_NAME = 'flux-offline';
const DB_VERSION = 1;
let _db;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('seances')) d.createObjectStore('seances', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('fragments')) {
        const s = d.createObjectStore('fragments', { keyPath: 'id' });
        s.createIndex('idConf', 'idConf', { unique: false });
      }
      if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'audio_file' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}
const idbReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet(store, key) {
  const d = await db();
  return idbReq(d.transaction(store).objectStore(store).get(key));
}
async function idbGetAll(store, query) {
  const d = await db();
  return idbReq(d.transaction(store).objectStore(store).getAll(query));
}
async function idbPut(store, val) {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).put(val);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbDelete(store, key) {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbBulk(entries) {
  // entries : { storeName: [records...] }
  const d = await db();
  const stores = Object.keys(entries);
  const tx = d.transaction(stores, 'readwrite');
  for (const s of stores) for (const rec of entries[s]) tx.objectStore(s).put(rec);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

/* --------------------------------------------------------------- API/data */
async function apiGet(path) {
  const res = await fetch(API + path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(path + ' → ' + res.status), { status: res.status });
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.detail || ('HTTP ' + res.status)), { status: res.status });
  return data;
}
const audioURL = (file) => API + '/audio/' + encodeURIComponent(file);

/* ------------------------------------------------------- auth (tierce) */
/* Connexion via un fournisseur tiers (Google pour l'instant), flux OAuth2
 * "implicit" dans une popup — aucun SDK externe. Le jeton d'identité est
 * re-vérifié côté API à chaque signalement ; ici on ne s'en sert que pour
 * afficher le nom et le joindre à l'envoi. */
let authState = null;               // { provider, idToken, exp, profile:{sub,email,name} } | null | {…, expired:true}

const b64url = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(atob(s).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
};
const decodeJWT = (t) => { try { return JSON.parse(b64url(t.split('.')[1])); } catch { return null; } };
const redirectURI = () => location.origin + location.pathname.replace(/index\.html$/, '');

let _providers;
async function authProviders() {
  if (_providers) return _providers;
  try { _providers = await apiGet('/api/auth/providers'); return _providers; }
  catch { return {}; }          // pas de mise en cache d'un échec (hors-ligne au boot)
}

async function loadAuth() {
  const rec = await idbGet('meta', 'auth');
  if (!rec) { authState = null; return; }
  authState = rec.exp * 1000 > Date.now() ? rec : { ...rec, expired: true };
}

async function signInGoogle(clientId) {
  const nonce = crypto.randomUUID(), state = crypto.randomUUID();
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: redirectURI(), response_type: 'id_token',
    scope: 'openid email profile', nonce, state, prompt: 'select_account',
  });
  const popup = window.open(url, 'flux-oauth', 'width=480,height=680');
  if (!popup) throw new Error('popup bloquée');
  const token = await new Promise((resolve, reject) => {
    const to = setTimeout(() => { done(); reject(new Error('délai dépassé')); }, 120000);
    const iv = setInterval(() => { if (popup.closed) { done(); reject(new Error('fenêtre fermée')); } }, 500);
    function done() { clearTimeout(to); clearInterval(iv); removeEventListener('message', onMsg); }
    function onMsg(e) {
      if (e.origin !== location.origin || !e.data || !e.data.__fluxOAuth) return;
      done();
      if (e.data.error) return reject(new Error(e.data.error));
      if (e.data.state !== state) return reject(new Error('state invalide'));
      resolve(e.data.id_token);
    }
    addEventListener('message', onMsg);
  });
  const payload = decodeJWT(token);
  if (!payload || payload.nonce !== nonce) throw new Error('jeton invalide');
  authState = {
    provider: 'google', idToken: token, exp: payload.exp,
    profile: { sub: payload.sub, email: payload.email, name: payload.name || payload.email },
  };
  await idbPut('meta', { k: 'auth', ...authState });
  return authState;
}

async function signOut() {
  await idbDelete('meta', 'auth');
  authState = null;
}

const isDownloaded = async (id) => !!(await idbGet('seances', Number(id)));
const downloadedSeances = async () =>
  (await idbGetAll('seances')).sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));

async function getSeanceData(id) {
  id = Number(id);
  const local = await idbGet('seances', id);
  if (local) {
    const d = await db();
    const frags = await idbReq(d.transaction('fragments').objectStore('fragments')
      .index('idConf').getAll(IDBKeyRange.only(id)));
    frags.sort((a, b) => a.start - b.start);
    return { ...local, fragments: frags, _offline: true };
  }
  if (!navigator.onLine) { const e = new Error('offline'); e.offline = true; throw e; }
  const data = await apiGet('/api/seances/' + id);
  data.fragments = (data.fragments || []).slice().sort((a, b) => a.start - b.start);
  return data;
}

/* ---------------------------------------------------- gestionnaire de DL */
const downloads = new Map();          // id -> { done, total, bytes, controller }

async function downloadSeance(id, onProgress) {
  id = Number(id);
  if (downloads.has(id)) return;
  const controller = new AbortController();
  const state = { done: 0, total: 0, bytes: 0, controller };
  downloads.set(id, state);
  try {
    const data = await apiGet('/api/seances/' + id);
    const frags = (data.fragments || []);
    const files = [...new Set(frags.map((f) => f.audio_file).filter(Boolean))];
    state.total = files.length;
    onProgress?.(state);

    let i = 0;
    const worker = async () => {
      while (i < files.length) {
        if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
        const file = files[i++];
        const have = await idbGet('audio', file);
        if (have) { state.done++; state.bytes += have.bytes || 0; onProgress?.(state); continue; }
        const res = await fetch(audioURL(file), { signal: controller.signal });
        if (!res.ok) throw new Error('audio ' + file + ' → ' + res.status);
        const blob = await res.blob();
        await idbPut('audio', { audio_file: file, blob, bytes: blob.size });
        state.done++; state.bytes += blob.size;
        onProgress?.(state);
      }
    };
    await Promise.all(Array.from({ length: Math.min(DL_CONCURRENCY, files.length || 1) }, worker));

    const seanceRec = {
      id: data.id, titre: data.titre, theme: data.theme, num: data.num,
      date: data.date, promo: data.promo, sujets: data.sujets || [],
      source: data.source || null, ref: data.ref || null,
      frag_count: frags.length, downloadedAt: Date.now(), bytes: state.bytes,
    };
    const fragRecs = frags.map((f) => ({
      id: f.id, idConf: f.idConf, idFrag: f.idFrag ?? null,
      start: f.start, end: f.end, texte: f.texte,
      concepts: f.concepts || [], audio_file: f.audio_file, fold: fold(f.texte),
    }));
    await idbBulk({ seances: [seanceRec], fragments: fragRecs });
    return seanceRec;
  } finally {
    downloads.delete(id);
  }
}

async function deleteSeance(id) {
  id = Number(id);
  const d = await db();
  const fragIdx = d.transaction('fragments').objectStore('fragments').index('idConf');
  const frags = await idbReq(fragIdx.getAll(IDBKeyRange.only(id)));
  const tx = d.transaction(['seances', 'fragments'], 'readwrite');
  tx.objectStore('seances').delete(id);
  for (const f of frags) tx.objectStore('fragments').delete(f.id);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  await sweepAudio();
}

/* Supprime les blobs audio qui ne sont plus référencés par aucun fragment. */
async function sweepAudio() {
  const frags = await idbGetAll('fragments');
  const keep = new Set(frags.map((f) => f.audio_file));
  const d = await db();
  const keys = await idbReq(d.transaction('audio').objectStore('audio').getAllKeys());
  const tx = d.transaction('audio', 'readwrite');
  for (const k of keys) if (!keep.has(k)) tx.objectStore('audio').delete(k);
  return new Promise((res) => { tx.oncomplete = res; });
}

async function wipeAll() {
  const d = await db();
  const tx = d.transaction(['seances', 'fragments', 'audio'], 'readwrite');
  tx.objectStore('seances').clear();
  tx.objectStore('fragments').clear();
  tx.objectStore('audio').clear();
  return new Promise((res) => { tx.oncomplete = res; });
}

async function storageInfo() {
  let usage = 0, quota = 0, persisted = false;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      usage = est.usage || 0;
      quota = est.quota || 0;
    }
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
  } catch (_) { /* pas critique */ }
  return { usage, quota, persisted };
}

/* --------------------------------------------------- recherche hors-ligne */
function buildSnippet(text, terms) {
  const f = fold(text);
  let first = -1;
  for (const t of terms) { const p = f.indexOf(t); if (p >= 0 && (first < 0 || p < first)) first = p; }
  if (first < 0) first = 0;
  const start = Math.max(0, first - 70), end = Math.min(text.length, first + 190);
  const seg = text.slice(start, end), fseg = f.slice(start, end);
  const ranges = [];
  for (const t of terms) { let p = 0; while ((p = fseg.indexOf(t, p)) >= 0) { ranges.push([p, p + t.length]); p += t.length; } }
  ranges.sort((a, b) => a[0] - b[0]);
  let html = '', cur = 0;
  for (const [a, b] of ranges) {
    if (a < cur) continue;
    html += esc(seg.slice(cur, a)) + '<mark>' + esc(seg.slice(a, b)) + '</mark>';
    cur = b;
  }
  html += esc(seg.slice(cur));
  return (start > 0 ? '… ' : '') + html + (end < text.length ? ' …' : '');
}

async function searchOffline(q) {
  const terms = fold(q).split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const phrase = fold(q);
  const frags = await idbGetAll('fragments');
  const seanceById = Object.fromEntries((await idbGetAll('seances')).map((s) => [s.id, s]));
  const out = [];
  for (const fr of frags) {
    const hay = fr.fold || fold(fr.texte);
    let ok = true, score = 0;
    for (const t of terms) {
      let c = 0, p = 0;
      while ((p = hay.indexOf(t, p)) >= 0) { c++; p += t.length; }
      if (!c) { ok = false; break; }
      score += c;
    }
    if (!ok) continue;
    if (hay.includes(phrase)) score += 6;
    out.push({
      fragId: fr.id, seanceId: fr.idConf, start: fr.start,
      seance: seanceById[fr.idConf], concepts: fr.concepts,
      score, snippet: buildSnippet(fr.texte, terms),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 80);
}

async function searchOnline(q) {
  const res = await apiGet('/api/search?limit=50&q=' + encodeURIComponent(q));
  return (res.hits || []).map((h) => ({
    fragId: h.id, seanceId: h.idConf, start: h.start,
    seance: { id: h.idConf, titre: h.conf_titre, num: h.conf_num, theme: h.conf_theme },
    concepts: h.concepts || [],
    snippet: (h._formatted?.texte || esc(h.texte)).replace(/<em>/g, '<mark>').replace(/<\/em>/g, '</mark>'),
  }));
}

/* =================================================================
 *  LECTEUR
 * ================================================================= */
const Player = (() => {
  const root = $('#player'), full = $('#playerFull'), audio = $('#audio');
  let playlist = [], idx = -1, seance = null, objURL = null, offline = false;

  const els = {
    mini: $('#playerMini'), pmTitle: $('#pmTitle'), pmSub: $('#pmSub'), pmToggle: $('#pmToggle'),
    pfSeance: $('#pfSeance'), pfText: $('#pfText'), pfConcepts: $('#pfConcepts'),
    seek: $('#pfSeek'), cur: $('#pfCur'), dur: $('#pfDur'), toggle: $('#pfToggle'),
    list: $('#pfList'), listToggle: $('#pfListToggle'),
    report: $('#pfReport'), reportBtns: $('#pfReportBtns'), reportForm: $('#pfReportForm'),
    prTitle: $('#prTitle'), prCorr: $('#prCorr'), prRemplacer: $('#prRemplacer'), prPar: $('#prPar'),
    prTexte: $('#prTexte'), prSurTout: $('#prSurTout'), prErr: $('#prErr'),
  };
  const REPORT_LABELS = {
    correction: 'Corriger la transcription', personne: 'Référence à une personne',
    oeuvre: 'Référence à une œuvre', date: 'Référence à une date ou une période',
    lieu: 'Référence à un lieu',
  };
  let reportType = null;

  function openFull() { full.hidden = false; renderList(); }
  function closeFull() { full.hidden = true; }

  async function start(seanceId, fragId) {
    let data;
    try { data = await getSeanceData(seanceId); }
    catch (e) { toast(e.offline ? 'Séance non téléchargée — hors connexion' : 'Lecture impossible'); return; }
    seance = data;
    offline = !!data._offline || !navigator.onLine;
    playlist = data.fragments;
    idx = fragId != null ? Math.max(0, playlist.findIndex((f) => f.id === Number(fragId))) : 0;
    root.hidden = false;
    openFull();
    await load(idx, true);
  }

  async function load(i, autoplay) {
    if (i < 0 || i >= playlist.length) return;
    idx = i;
    const fr = playlist[i];
    if (objURL) { URL.revokeObjectURL(objURL); objURL = null; }

    let src;
    const rec = await idbGet('audio', fr.audio_file);
    if (rec) { objURL = URL.createObjectURL(rec.blob); src = objURL; }
    else if (navigator.onLine) src = audioURL(fr.audio_file);
    else { toast('Fragment non téléchargé — hors connexion'); return; }

    audio.src = src;
    audio.load();
    if (autoplay) audio.play().catch(() => {});

    els.pfSeance.textContent = `${seance.theme || ''} · séance ${seance.num ?? '—'} · ${fmtHMS(fr.start)}`;
    els.pmTitle.textContent = seance.titre || 'Séance';
    els.pmSub.textContent = `Fragment ${i + 1} / ${playlist.length} · ${fmtHMS(fr.start)}`;
    els.pfText.textContent = fr.texte || '';
    els.pfConcepts.innerHTML = (fr.concepts || []).slice(0, 12)
      .map((c, k) => `<span class="concept${k === 0 ? ' live' : ''}">${esc(c)}</span>`).join('');
    renderList();
    closeReportForm();
    refreshReport();
    updateMediaSession(fr);
  }

  /* --- signalements (visibles seulement si connecté) --- */
  function refreshReport() {
    els.report.hidden = !(authState && !authState.expired && idx >= 0);
  }
  function openReportForm(type) {
    reportType = type;
    els.prTitle.textContent = `${REPORT_LABELS[type]} — à ${fmtHMS(audio.currentTime)}`;
    els.prCorr.hidden = type !== 'correction';
    els.prTexte.hidden = type === 'correction';
    els.prErr.hidden = true;
    els.prTexte.value = ''; els.prRemplacer.value = ''; els.prPar.value = ''; els.prSurTout.checked = false;
    $$('button', els.reportBtns).forEach((b) => b.classList.toggle('on', b.dataset.report === type));
    els.reportForm.hidden = false;
  }
  function closeReportForm() {
    reportType = null;
    els.reportForm.hidden = true;
    $$('button', els.reportBtns).forEach((b) => b.classList.remove('on'));
  }
  async function submitReport() {
    if (!reportType || !authState) return;
    if (authState.expired) { els.prErr.textContent = 'Session expirée — reconnectez-vous (icône compte).'; els.prErr.hidden = false; return; }
    const fr = playlist[idx];
    const body = {
      id_token: authState.idToken, provider: authState.provider,
      idConf: seance.id, idTrans: fr.id, idFrag: fr.idFrag ?? null,
      type: reportType, timecode: Math.round(audio.currentTime * 10) / 10,
      lien: redirectURI() + '#/seance/' + seance.id,
    };
    if (reportType === 'correction') {
      body.remplacer = els.prRemplacer.value.trim();
      body.par = els.prPar.value.trim();
      body.surTout = els.prSurTout.checked;
      if (!body.remplacer) { els.prErr.textContent = 'Indiquez le texte à remplacer.'; els.prErr.hidden = false; return; }
      body.texte = `Remplacer « ${body.remplacer} » par « ${body.par} »` + (body.surTout ? ' (toute la séance)' : '');
    } else {
      body.texte = els.prTexte.value.trim();
      body.surTout = els.prSurTout.checked;
      if (!body.texte) { els.prErr.textContent = 'Décrivez la référence.'; els.prErr.hidden = false; return; }
    }
    $('#prSubmit').disabled = true;
    try {
      await apiPost('/api/signalements', body);
      closeReportForm();
      toast('Signalement envoyé — merci');
    } catch (e) {
      els.prErr.textContent = 'Échec de l\'envoi : ' + e.message;
      els.prErr.hidden = false;
    } finally {
      $('#prSubmit').disabled = false;
    }
  }

  function renderList() {
    if (full.hidden || els.list.hidden) return;
    els.list.innerHTML = playlist.map((f, i) =>
      `<li class="${i === idx ? 'on' : ''}" data-i="${i}"><span class="t">${fmtHMS(f.start)}</span><span>${esc((f.texte || '').slice(0, 90))}${(f.texte || '').length > 90 ? '…' : ''}</span></li>`
    ).join('');
  }

  function updateMediaSession(fr) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${fmtHMS(fr.start)} — ${(fr.concepts || [])[0] || 'transcription'}`,
      artist: seance.titre || 'Flux Conceptuel',
      album: `${seance.theme || ''} · séance ${seance.num ?? ''}`,
    });
    const set = (a, h) => { try { navigator.mediaSession.setActionHandler(a, h); } catch (_) {} };
    set('play', () => audio.play());
    set('pause', () => audio.pause());
    set('previoustrack', () => load(idx - 1, true));
    set('nexttrack', () => load(idx + 1, true));
    set('seekbackward', () => { audio.currentTime -= 10; });
    set('seekforward', () => { audio.currentTime += 10; });
  }

  audio.addEventListener('play', () => { els.toggle.textContent = '❚❚'; els.pmToggle.textContent = '❚❚'; });
  audio.addEventListener('pause', () => { els.toggle.textContent = '▶'; els.pmToggle.textContent = '▶'; savePos(); });
  audio.addEventListener('ended', () => { if (idx < playlist.length - 1) load(idx + 1, true); else savePos(); });
  audio.addEventListener('timeupdate', () => {
    els.cur.textContent = fmtHMS(audio.currentTime);
    if (audio.duration) els.seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  });
  audio.addEventListener('loadedmetadata', () => { els.dur.textContent = fmtHMS(audio.duration); });

  els.seek.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (els.seek.value / 1000) * audio.duration;
  });
  els.toggle.addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
  els.pmToggle.addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
  $('#pfPrev').addEventListener('click', () => load(idx - 1, true));
  $('#pfNext').addEventListener('click', () => load(idx + 1, true));
  $('#pfBack').addEventListener('click', () => { audio.currentTime -= 10; });
  $('#pfFwd').addEventListener('click', () => { audio.currentTime += 10; });
  $('#pfClose').addEventListener('click', closeFull);
  els.mini.addEventListener('click', (e) => { if (e.target !== els.pmToggle) openFull(); });
  els.listToggle.addEventListener('click', () => { els.list.hidden = !els.list.hidden; renderList(); });
  els.list.addEventListener('click', (e) => {
    const li = e.target.closest('li'); if (li) load(Number(li.dataset.i), true);
  });
  els.reportBtns.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-report]');
    if (b) (reportType === b.dataset.report ? closeReportForm() : openReportForm(b.dataset.report));
  });
  $('#prCancel').addEventListener('click', closeReportForm);
  $('#prSubmit').addEventListener('click', submitReport);

  let saveTimer;
  function savePos() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (idx < 0 || !seance) return;
      idbPut('meta', { k: 'lastPlayed', seanceId: seance.id, fragId: playlist[idx]?.id, time: audio.currentTime, at: Date.now() });
    }, 400);
  }

  return { start, isActive: () => idx >= 0, refreshReport };
})();

/* =================================================================
 *  ROUTAGE + VUES
 * ================================================================= */
const app = $('#app');
const setTop = (t) => { $('#topTitle').textContent = t; };
const showBack = (show) => { $('#btnBack').hidden = !show; };

function setActiveTab(name) {
  $$('.tab').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
}

const loading = () => { app.innerHTML = '<div class="view"><p class="empty"><span class="spinner"></span></p></div>'; };
function errorBox(msg, retry) {
  app.innerHTML = `<div class="view"><p class="empty">${esc(msg)}</p></div>`;
  if (retry) {
    const b = el('button', { className: 'btn btn-outline', textContent: 'Réessayer', onclick: retry });
    $('.empty', app).after(b);
  }
}

/* ---- Catalogue : thèmes (en ligne) ou séances téléchargées (hors-ligne) */
async function viewHome() {
  setActiveTab('home'); setTop('Flux Conceptuel'); showBack(false);
  loading();
  if (!navigator.onLine) return viewDownloads(true);
  try {
    const themes = await apiGet('/api/themes');
    const v = el('div', { className: 'view' });
    v.innerHTML = `<p class="eyebrow">Catalogue</p>
      <h1 class="screen-title">Thèmes de cours</h1>
      <p class="screen-sub">${themes.length} thèmes · touchez pour voir les séances</p>`;
    themes.forEach((t, i) => {
      const row = el('a', { className: 'row', href: '#/theme/' + encodeURIComponent(t.theme) });
      row.innerHTML = `<span class="row-n">${String(i + 1).padStart(2, '0')}</span>
        <span class="row-main"><span class="row-title">${esc(t.theme)}</span>
        <span class="row-meta">${t.seance_count} séance${t.seance_count > 1 ? 's' : ''}</span></span>
        <span class="row-chevron">›</span>`;
      v.append(row);
    });
    app.replaceChildren(v);
  } catch (e) {
    errorBox('Catalogue indisponible (' + (e.status || 'réseau') + ').', viewHome);
  }
}

async function viewTheme(theme) {
  setActiveTab('home'); setTop(theme); showBack(true);
  loading();
  try {
    const [seances, dl] = await Promise.all([
      apiGet('/api/themes/' + encodeURIComponent(theme) + '/seances'),
      downloadedSeances(),
    ]);
    const dlIds = new Set(dl.map((s) => s.id));
    const v = el('div', { className: 'view' });
    v.innerHTML = `<p class="eyebrow">${esc(theme)}</p>
      <h1 class="screen-title">${seances.length} séance${seances.length > 1 ? 's' : ''}</h1>
      <p class="screen-sub">ordre chronologique</p>`;
    seances.forEach((s) => {
      const row = el('a', { className: 'row', href: '#/seance/' + s.id });
      row.innerHTML = `<span class="row-n">${s.num ?? '—'}</span>
        <span class="row-main"><span class="row-title">${esc(s.titre || 'Séance ' + s.num)}</span>
        <span class="row-meta">${s.frag_count || 0} fragments · ≈ ${Math.max(1, Math.round((s.frag_count || 0) * AVG_FRAG_KB / 1024))} Mo</span></span>
        ${dlIds.has(s.id) ? '<span class="row-badge">hors-ligne</span>' : '<span class="row-chevron">›</span>'}`;
      v.append(row);
    });
    app.replaceChildren(v);
  } catch (e) {
    errorBox('Impossible de charger les séances.', () => viewTheme(theme));
  }
}

async function viewSeance(id) {
  setActiveTab('home'); setTop('Séance'); showBack(true);
  loading();
  let data;
  try { data = await getSeanceData(id); }
  catch (e) {
    return errorBox(e.offline ? 'Séance non téléchargée — connectez-vous pour la consulter.' : 'Séance introuvable.',
      e.offline ? null : () => viewSeance(id));
  }
  const local = await idbGet('seances', Number(id));
  const estMo = Math.max(1, Math.round((data.frag_count || data.fragments.length) * AVG_FRAG_KB / 1024));

  const v = el('div', { className: 'view' });
  v.innerHTML = `
    <p class="eyebrow">${esc(data.theme || '')} · séance ${data.num ?? '—'}</p>
    <div class="card">
      <div class="card-title">${esc(data.titre || 'Séance ' + data.num)}</div>
      <div class="muted">${fmtDate(data.date)} · ${data.fragments.length} fragments transcrits</div>
      <div class="tags">${(data.sujets || []).slice(0, 8).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      <div id="seanceActions"></div>
    </div>
    <p class="eyebrow">Aperçu</p>
    <div id="fragPreview"></div>`;

  const actions = $('#seanceActions', v);
  function renderActions() {
    actions.innerHTML = '';
    const dling = downloads.get(Number(id));
    if (dling) { renderProgress(); return; }
    if (local) {
      actions.append(
        el('button', { className: 'btn btn-primary', textContent: '▶  Écouter', onclick: () => Player.start(id) }),
        el('div', { style: 'height:10px' }),
        el('button', {
          className: 'btn btn-danger', textContent: 'Supprimer (' + fmtSize(local.bytes) + ')',
          onclick: async () => { await deleteSeance(id); toast('Séance supprimée'); viewSeance(id); },
        }),
      );
    } else {
      const dlBtn = el('button', {
        className: 'btn btn-primary',
        textContent: navigator.onLine ? `⤓  Télécharger  ·  ≈ ${estMo} Mo` : 'Hors connexion',
        disabled: !navigator.onLine,
        onclick: () => runDownload(),
      });
      actions.append(dlBtn, el('div', { style: 'height:10px' }));
      if (navigator.onLine) actions.append(
        el('button', { className: 'btn btn-outline', textContent: '▶  Écouter en ligne', onclick: () => Player.start(id) }));
    }
  }
  function renderProgress(st) {
    const s = st || downloads.get(Number(id)) || { done: 0, total: 0, bytes: 0 };
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    actions.innerHTML = `
      <div class="progress">
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-label"><span>${s.done} / ${s.total || '…'} fichiers · ${fmtSize(s.bytes)}</span><span>${pct}%</span></div>
      </div>`;
    actions.append(el('button', {
      className: 'btn btn-outline btn-sm', textContent: 'Annuler',
      onclick: () => { downloads.get(Number(id))?.controller.abort(); },
    }));
  }
  async function runDownload() {
    renderProgress({ done: 0, total: 0, bytes: 0 });
    try {
      await downloadSeance(id, (st) => renderProgress(st));
      toast('Séance disponible hors-ligne');
    } catch (e) {
      if (e.name === 'AbortError') toast('Téléchargement annulé');
      else { console.error(e); toast('Échec du téléchargement'); }
    }
    viewSeance(id);
  }

  renderActions();
  $('#fragPreview', v).innerHTML = data.fragments.slice(0, 4).map((f) => `
    <div class="row" style="cursor:default">
      <span class="row-n">${fmtHMS(f.start)}</span>
      <span class="row-main"><span class="row-meta" style="color:var(--text);font-size:14px">${esc((f.texte || '').slice(0, 160))}…</span></span>
    </div>`).join('');
  app.replaceChildren(v);
}

async function viewDownloads(fromOffline) {
  setActiveTab('downloads'); setTop('Hors-ligne'); showBack(false);
  const list = await downloadedSeances();
  const total = list.reduce((n, s) => n + (s.bytes || 0), 0);
  const v = el('div', { className: 'view' });
  v.innerHTML = `<p class="eyebrow">${fromOffline ? 'Hors connexion' : 'Séances téléchargées'}</p>
    <h1 class="screen-title">${list.length} séance${list.length > 1 ? 's' : ''}</h1>
    <p class="screen-sub">${fmtSize(total)} · disponibles sans réseau</p>`;
  if (!list.length) {
    v.append(el('p', { className: 'empty', textContent: navigator.onLine
      ? 'Aucune séance téléchargée. Ouvrez une séance du catalogue et touchez « Télécharger ».'
      : 'Aucune séance téléchargée, et pas de connexion.' }));
  }
  list.forEach((s) => {
    const row = el('a', { className: 'row', href: '#/seance/' + s.id });
    row.innerHTML = `<span class="row-n">${s.num ?? '—'}</span>
      <span class="row-main"><span class="row-title">${esc(s.titre || 'Séance ' + s.num)}</span>
      <span class="row-meta">${esc(s.theme || '')} · ${s.frag_count} fragments · ${fmtSize(s.bytes)}</span></span>
      <span class="row-chevron">›</span>`;
    v.append(row);
  });
  app.replaceChildren(v);
}

async function viewSearch() {
  setActiveTab('search'); setTop('Recherche'); showBack(false);
  const v = el('div', { className: 'view' });
  v.innerHTML = `
    <p class="eyebrow">Recherche plein texte</p>
    <div class="search-field">
      <input id="q" type="search" enterkeyhint="search" placeholder="un mot, une expression…" autocomplete="off">
    </div>
    <div class="seg">
      <button data-scope="offline" class="on">Téléchargées</button>
      <button data-scope="online">Tout le corpus</button>
    </div>
    <div id="results"></div>`;
  app.replaceChildren(v);

  const input = $('#q', v), results = $('#results', v);
  let scope = 'offline', timer;
  $$('.seg button', v).forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    $$('.seg button', v).forEach((x) => x.classList.toggle('on', x === b));
    run();
  }));

  async function run() {
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = '<p class="empty">Saisissez au moins deux caractères.</p>'; return; }
    if (scope === 'online' && !navigator.onLine) { results.innerHTML = '<p class="empty">« Tout le corpus » demande une connexion.</p>'; return; }
    results.innerHTML = '<p class="empty"><span class="spinner"></span></p>';
    try {
      const hits = scope === 'offline' ? await searchOffline(q) : await searchOnline(q);
      if (!hits.length) { results.innerHTML = '<p class="empty">Aucun résultat.</p>'; return; }
      results.innerHTML = '';
      hits.forEach((h) => {
        const row = el('button', { className: 'row hit', style: 'display:flex' });
        const s = h.seance || {};
        row.innerHTML = `<span class="row-main">
          <span class="hit-text" style="font-size:15px;line-height:1.5">${h.snippet}</span>
          <span class="row-meta">${esc(s.titre || 'Séance')} · séance ${s.num ?? '—'} · ${fmtHMS(h.start)}</span>
          </span><span class="row-chevron">›</span>`;
        row.addEventListener('click', () => Player.start(h.seanceId, h.fragId));
        results.append(row);
      });
    } catch (e) {
      results.innerHTML = `<p class="empty">Recherche impossible (${esc(String(e.status || 'réseau'))}).</p>`;
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  input.focus();
}

async function viewStorage() {
  setActiveTab('storage'); setTop('Espace'); showBack(false);
  const [{ usage, quota, persisted }, list] = await Promise.all([storageInfo(), downloadedSeances()]);
  const totalDl = list.reduce((n, s) => n + (s.bytes || 0), 0);
  const pct = quota ? Math.min(100, (usage / quota) * 100) : 0;
  const v = el('div', { className: 'view' });
  v.innerHTML = `
    <p class="eyebrow">Stockage de l'application</p>
    <h1 class="screen-title">${fmtSize(totalDl)}</h1>
    <p class="screen-sub">${list.length} séance${list.length > 1 ? 's' : ''} hors-ligne</p>
    <div class="gauge"><div class="gauge-fill" style="width:${pct}%"></div></div>
    <div class="kv"><span class="k">Utilisé (tout le site)</span><span>${fmtSize(usage)}</span></div>
    <div class="kv"><span class="k">Quota estimé du navigateur</span><span>${quota ? fmtSize(quota) : '—'}</span></div>
    <div class="kv"><span class="k">Stockage persistant</span><span>${persisted ? 'accordé' : 'non garanti'}</span></div>
    <div style="height:16px"></div>
    <div id="storeActions"></div>
    <div style="height:24px"></div>
    <p class="eyebrow">Séances</p>
    <div id="storeList"></div>`;
  const acts = $('#storeActions', v);
  if (!persisted && navigator.storage?.persist) {
    acts.append(el('button', {
      className: 'btn btn-outline', textContent: 'Demander un stockage persistant',
      onclick: async () => { const ok = await navigator.storage.persist(); toast(ok ? 'Accordé' : 'Refusé par le navigateur'); viewStorage(); },
    }), el('div', { style: 'height:10px' }));
  }
  if (list.length) acts.append(el('button', {
    className: 'btn btn-danger', textContent: 'Tout supprimer',
    onclick: async () => { if (confirm('Supprimer toutes les séances téléchargées ?')) { await wipeAll(); toast('Tout a été supprimé'); viewStorage(); } },
  }));
  $('#storeList', v).innerHTML = list.map((s) => `
    <div class="row" style="cursor:default">
      <span class="row-main"><span class="row-title" style="font-size:16px">${esc(s.titre || 'Séance ' + s.num)}</span>
      <span class="row-meta">${esc(s.theme || '')} · ${fmtSize(s.bytes)}</span></span>
      <button class="btn btn-danger btn-sm" data-del="${s.id}">Suppr.</button>
    </div>`).join('') || '<p class="empty">Rien à afficher.</p>';
  $('#storeList', v).addEventListener('click', async (e) => {
    const id = e.target.dataset?.del;
    if (id) { await deleteSeance(id); toast('Séance supprimée'); viewStorage(); }
  });
  app.replaceChildren(v);
}

/* ------------------------------------------------------------- routeur */
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [, seg, arg] = h.match(/^\/([^/]*)\/?(.*)$/) || [, '', ''];
  window.scrollTo(0, 0);
  if (seg === '' ) return viewHome();
  if (seg === 'theme') return viewTheme(decodeURIComponent(arg));
  if (seg === 'seance') return viewSeance(arg);
  if (seg === 'downloads') return viewDownloads();
  if (seg === 'search') return viewSearch();
  if (seg === 'storage') return viewStorage();
  return viewHome();
}
window.addEventListener('hashchange', route);
$('#btnBack').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#/'; });
$('#topTitle').addEventListener('click', () => { location.hash = '#/'; });

/* ------------------------------------------------------- compte / auth */
function refreshAcctBadge() {
  $('#btnAcct').classList.toggle('connected', !!(authState && !authState.expired));
}
async function renderAcct() {
  const provs = await authProviders();
  const c = $('#acctContent');
  if (authState && !authState.expired) {
    c.innerHTML = `<div class="acct-name">${esc(authState.profile.name || 'Connecté')}</div>
      <div class="acct-mail">${esc(authState.profile.email || '')} · via ${esc(authState.provider)}</div>
      <button class="btn btn-outline" id="acctOut">Se déconnecter</button>`;
    $('#acctOut').onclick = async () => { await signOut(); refreshAcctBadge(); Player.refreshReport(); renderAcct(); };
  } else if (provs.google) {
    c.innerHTML = `<p class="muted" style="margin-bottom:14px">${authState?.expired
      ? 'Session expirée — reconnectez-vous.'
      : 'Connectez-vous pour signaler une correction ou une référence dans une transcription. Votre identité sert à créditer le signalement et à retrouver votre compte lors de l\'import.'}</p>
      <button class="btn btn-google" id="acctGoogle">Se connecter avec Google</button>`;
    $('#acctGoogle').onclick = async () => {
      try {
        await signInGoogle(provs.google.client_id);
        refreshAcctBadge(); Player.refreshReport(); renderAcct();
        toast('Connecté : ' + (authState.profile.name || authState.profile.email));
      } catch (e) { toast('Connexion : ' + e.message); }
    };
  } else {
    c.innerHTML = `<p class="muted">Aucun fournisseur d'authentification n'est configuré côté serveur.</p>`;
  }
}
$('#btnAcct').addEventListener('click', () => { $('#acctSheet').hidden = false; renderAcct(); });
$('#acctClose').addEventListener('click', () => { $('#acctSheet').hidden = true; });
$('#acctSheet').addEventListener('click', (e) => { if (e.target === $('#acctSheet')) $('#acctSheet').hidden = true; });

/* ------------------------------------------------------- connectivité */
function refreshNet() {
  const b = $('#netBadge'), on = navigator.onLine;
  b.classList.toggle('online', on);
  b.classList.toggle('offline', !on);
  $('.net-label', b).textContent = on ? 'en ligne' : 'hors-ligne';
}
window.addEventListener('online', () => { refreshNet(); toast('Connexion rétablie'); });
window.addEventListener('offline', () => { refreshNet(); toast('Hors connexion — contenu téléchargé seulement'); });

/* ------------------------------------------------------- service worker */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nouvelle version — rouvrez l\'app');
      });
    });
  }).catch(() => {});
}

/* --------------------------------------------------------------- boot */
refreshNet();
try { navigator.storage?.persist?.(); } catch (_) {}
loadAuth().then(() => { refreshAcctBadge(); Player.refreshReport(); }).catch(() => {});
route();
