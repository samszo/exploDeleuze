import { fetchConferences, fetchTranscriptions, fetchSearchResults, fetchMesAnnotations, signalerFragment, relancerTranscription, mediaUrl } from "./api.js?v=19";
import { login, logout, getAuth } from "./auth.js?v=19";
import { getZoteroAuth, saveZoteroAuth, findOrCreateCourseItem, createExtractItem, uploadAttachment } from "./zotero.js?v=19";
import { extractAudioRange } from "./audioExtract.js?v=19";
import { saveProgress, getProgress, removeProgress, getRecentHistory, clearHistory } from "./history.js?v=19";
import { Player } from "./player.js?v=19";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const viewList = document.getElementById("view-list");
const viewPlayer = document.getElementById("view-player");
const viewHistory = document.getElementById("view-history");
const viewAnnotations = document.getElementById("view-annotations");
const courseGroups = document.getElementById("course-groups");
const historyGroups = document.getElementById("history-groups");
const annotationsGroups = document.getElementById("annotations-groups");
const searchForm = document.getElementById("search-form");
const search = document.getElementById("search");

const btnOpenHistory = document.getElementById("btn-open-history");
const btnHistoryBack = document.getElementById("btn-history-back");
const btnOpenAnnotations = document.getElementById("btn-open-annotations");
const btnAnnotationsBack = document.getElementById("btn-annotations-back");
const btnCheckUpdate = document.getElementById("btn-check-update");
const updateCheckStatus = document.getElementById("update-check-status");

const audioEl = document.getElementById("audio");
const captionsEl = document.getElementById("captions");
const courseTitleEl = document.getElementById("course-title");
const courseMetaEl = document.getElementById("course-meta");
const fragmentCounterEl = document.getElementById("fragment-counter");
const timeElapsedEl = document.getElementById("time-elapsed");
const progressFillEl = document.getElementById("progress-fill");
const btnPlay = document.getElementById("btn-play");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnBack = document.getElementById("btn-back");
const btnCopyRef = document.getElementById("btn-copy-ref");
const btnShare = document.getElementById("btn-share");

const btnSelectExtract = document.getElementById("btn-select-extract");
const extractPanel = document.getElementById("extract-panel");
const extractTitle = document.getElementById("extract-title");
const btnExtractDownload = document.getElementById("btn-extract-download");
const btnExtractZotero = document.getElementById("btn-extract-zotero");
const btnExtractCancel = document.getElementById("btn-extract-cancel");
const extractError = document.getElementById("extract-error");
const extractSuccess = document.getElementById("extract-success");
const zoteroLoginForm = document.getElementById("zotero-login-form");

const updateBanner = document.getElementById("update-banner");
const btnUpdate = document.getElementById("btn-update");

const btnAuthToggle = document.getElementById("btn-auth-toggle");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loggedInBox = document.getElementById("logged-in-box");
const loggedInName = document.getElementById("logged-in-name");
const btnLogout = document.getElementById("btn-logout");

const collabActions = document.getElementById("collab-actions");
const reportPanel = document.getElementById("report-panel");
const reportTitle = document.getElementById("report-title");
const reportModele = document.getElementById("report-modele");
const reportTexte = document.getElementById("report-texte");
const reportCorrection = document.getElementById("report-correction");
const reportRemplacer = document.getElementById("report-remplacer");
const reportPar = document.getElementById("report-par");
const reportSurTout = document.getElementById("report-sur-tout");
const reportError = document.getElementById("report-error");
const btnReportCancel = document.getElementById("btn-report-cancel");
const btnReportSubmit = document.getElementById("btn-report-submit");

const REPORT_LABELS = {
  relancer: "Relancer la transcription de ce fragment",
  correction: "Signaler une correction à faire dans la transcription",
  personne: "Signaler la référence à une personne",
  oeuvre: "Signaler la référence à une œuvre",
  date: "Signaler la référence à une date ou une période",
  lieu: "Signaler la référence à un lieu",
};

let conferences = [];
let currentReportType = null;
let currentReportTimecode = null;
let currentConf = null;
let extractedBlob = null;

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function setIcon(button, name) {
  button.innerHTML = `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
}

const player = new Player(audioEl, captionsEl, {
  onFragmentChange: (index, total, fragment) => {
    fragmentCounterEl.textContent = `Fragment ${index + 1} / ${total}`;
    progressFillEl.style.width = "0%";
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === total - 1;
    btnCopyRef.disabled = !mediaFragmentUrl(fragment);
    btnCopyRef.classList.remove("copied");
    setIcon(btnCopyRef, "link");
    btnShare.disabled = !fragmentShareUrl(fragment);
    btnShare.classList.remove("copied");
    setIcon(btnShare, "share-nodes");
    closeReportPanel();
    exitSelectionMode();
    if (currentConf && currentConf.id != null) saveProgress(currentConf.id, fragment.idTrans, 0);
  },
  onProgress: (ratio) => {
    progressFillEl.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  },
  onGlobalProgress: (elapsed, total) => {
    timeElapsedEl.textContent = `${formatTime(elapsed)} / ${formatTime(total)}`;
  },
  onCourseEnd: () => {
    setIcon(btnPlay, "play");
    fragmentCounterEl.textContent = "Cours terminé";
  },
  onSelectionChange: (range) => {
    extractedBlob = null;
    extractError.classList.add("hidden");
    extractSuccess.classList.add("hidden");
    zoteroLoginForm.classList.add("hidden");
    if (!range) {
      extractTitle.textContent = "Touchez le premier mot de l'extrait";
      btnExtractDownload.disabled = true;
      btnExtractZotero.disabled = true;
    } else if (!range.end) {
      const globalStart = (player.cumulativeOffsets[player.index] || 0) + range.start.start;
      extractTitle.textContent = `Touchez le dernier mot de l'extrait (début : ${formatTime(globalStart)})`;
      btnExtractDownload.disabled = true;
      btnExtractZotero.disabled = true;
    } else {
      const duration = range.end.end - range.start.start;
      const { start, end } = globalRange(player.index, range);
      extractTitle.textContent = `Extrait sélectionné : ${formatTime(start)} → ${formatTime(end)} (${duration.toFixed(1)}s)`;
      btnExtractDownload.disabled = false;
      btnExtractZotero.disabled = false;
    }
  },
});

function saveCurrentProgress() {
  const fragment = player.fragments[player.index];
  if (currentConf && currentConf.id != null && fragment) {
    saveProgress(currentConf.id, fragment.idTrans, audioEl.currentTime);
  }
}

audioEl.addEventListener("play", () => setIcon(btnPlay, "pause"));
audioEl.addEventListener("pause", () => {
  setIcon(btnPlay, "play");
  saveCurrentProgress();
});

// l'utilisateur quitte l'onglet/l'appli en cours de lecture (sans passer par pause)
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !viewPlayer.classList.contains("hidden")) saveCurrentProgress();
});

btnPlay.addEventListener("click", () => player.toggle());
btnPrev.addEventListener("click", () => player.goTo(player.index - 1));
btnNext.addEventListener("click", () => player.goTo(player.index + 1));
btnBack.addEventListener("click", () => {
  audioEl.pause();
  // l'évènement "pause" natif (qui sauvegarde aussi) est asynchrone : on sauvegarde
  // explicitement ici pour ne pas rafraîchir la liste avant que ce soit fait.
  saveCurrentProgress();
  showList();
  renderCourseList(search.value.trim());
});

btnOpenHistory.addEventListener("click", showHistory);
btnHistoryBack.addEventListener("click", showList);
btnOpenAnnotations.addEventListener("click", showAnnotations);
btnAnnotationsBack.addEventListener("click", showList);

// URI du fragment au format Media Fragments (https://www.w3.org/TR/media-frags/) :
// fichier audio BnF/Gallica + horodatage cumulé #t=début,fin depuis le début de ce fichier.
function mediaFragmentUrl(fragment) {
  /*problème de refus de lien direct à gallica
  if (!fragment || !fragment.gallica) return null;
  return `${fragment.gallica}#t=${fragment.start},${fragment.end}`;
  */
  if (!fragment || !fragment.bnf) return null;
  return `${fragment.bnf}#disque=${fragment.num}&plage=${fragment.plage}&t=${fragment.start},${fragment.end}`;
}

btnCopyRef.addEventListener("click", async () => {
  const fragment = player.fragments[player.index];
  const url = mediaFragmentUrl(fragment);
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    setIcon(btnCopyRef, "check");
    btnCopyRef.classList.add("copied");
    setTimeout(() => {
      setIcon(btnCopyRef, "link");
      btnCopyRef.classList.remove("copied");
    }, 1500);
  } catch (err) {
    console.error(err);
  }
});

// lien profond vers l'appli elle-même, ouvrant directement ce cours à ce fragment
function fragmentShareUrl(fragment) {
  if (!fragment || !fragment.idConf || !fragment.idTrans) return null;
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("idConf", fragment.idConf);
  url.searchParams.set("idTrans", fragment.idTrans);
  return url.toString();
}

btnShare.addEventListener("click", async () => {
  const fragment = player.fragments[player.index];
  const url = fragmentShareUrl(fragment);
  if (!url) return;

  const shareData = {
    title: courseTitleEl.textContent,
    text: `${courseTitleEl.textContent} — extrait du fragment ${player.index + 1}`,
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err.name !== "AbortError") console.error(err);
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    setIcon(btnShare, "check");
    btnShare.classList.add("copied");
    setTimeout(() => {
      setIcon(btnShare, "share-nodes");
      btnShare.classList.remove("copied");
    }, 1500);
  } catch (err) {
    console.error(err);
  }
});

// --- Extraction d'un extrait audio (sélection de mots) ---

function exitSelectionMode() {
  btnSelectExtract.classList.remove("copied");
  captionsEl.classList.remove("selecting");
  extractPanel.classList.add("hidden");
  player.setSelectionMode(false);
}

btnSelectExtract.addEventListener("click", () => {
  const active = !captionsEl.classList.contains("selecting");
  if (active) {
    btnSelectExtract.classList.add("copied");
    captionsEl.classList.add("selecting");
    extractPanel.classList.remove("hidden");
    player.setSelectionMode(true);
  } else {
    exitSelectionMode();
  }
});

btnExtractCancel.addEventListener("click", exitSelectionMode);

// Position de l'extrait par rapport à la totalité du cours (mêmes offsets cumulés
// que "time-elapsed", qui s'enchaînent en continu d'un fragment à l'autre). Ne pas
// utiliser fragment.start/end ici : ces champs redémarrent à 0 à chaque nouveau
// disque Gallica/BnF (un cours en a souvent plusieurs), ce qui désynchroniserait
// cet affichage de celui de "time-elapsed" passé la fin du premier disque.
function globalRange(fragmentIndex, range) {
  const offset = player.cumulativeOffsets[fragmentIndex] || 0;
  return {
    start: offset + range.start.start,
    end: offset + range.end.end,
  };
}

function extractFilename(fragment, range) {
  const safeTheme = (fragment.theme || "extrait").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  const { start } = globalRange(player.index, range);
  return `${safeTheme}-cours${fragment.num || ""}-${formatTime(start).replace(":", "m")}s.wav`;
}

async function getOrCreateExtract() {
  if (extractedBlob) return extractedBlob;
  const fragment = player.fragments[player.index];
  const range = player.getSelectionRange();
  if (!fragment || !range || !range.end) throw new Error("Aucun extrait sélectionné.");
  extractedBlob = await extractAudioRange(mediaUrl(fragment.source), range.start.start, range.end.end);
  return extractedBlob;
}

btnExtractDownload.addEventListener("click", async () => {
  extractError.classList.add("hidden");
  extractSuccess.classList.add("hidden");
  btnExtractDownload.disabled = true;
  try {
    const fragment = player.fragments[player.index];
    const range = player.getSelectionRange();
    const blob = await getOrCreateExtract();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = extractFilename(fragment, range);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) {
    extractError.textContent = "Échec de l'extraction : " + err.message;
    extractError.classList.remove("hidden");
    console.error(err);
  } finally {
    btnExtractDownload.disabled = false;
  }
});

btnExtractZotero.addEventListener("click", async () => {
  extractError.classList.add("hidden");
  extractSuccess.classList.add("hidden");

  const zoteroAuth = getZoteroAuth();
  if (!zoteroAuth) {
    zoteroLoginForm.classList.remove("hidden");
    return;
  }

  await sendExtractToZotero(zoteroAuth);
});

zoteroLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userId = document.getElementById("zotero-userid").value.trim();
  const apiKey = document.getElementById("zotero-apikey").value.trim();
  const auth = saveZoteroAuth(userId, apiKey);
  zoteroLoginForm.classList.add("hidden");
  zoteroLoginForm.reset();
  await sendExtractToZotero(auth);
});

async function sendExtractToZotero(zoteroAuth) {
  btnExtractZotero.disabled = true;
  extractError.classList.add("hidden");
  try {
    const fragment = player.fragments[player.index];
    const range = player.getSelectionRange();
    if (!fragment || !range || !range.end) throw new Error("Aucun extrait sélectionné.");
    if (!currentConf) throw new Error("Référence du cours indisponible.");

    const blob = await getOrCreateExtract();
    const filename = extractFilename(fragment, range);

    const { start: globalStart, end: globalEnd } = globalRange(player.index, range);
    const positionLabel = `${formatTime(globalStart)} → ${formatTime(globalEnd)}`;
    const title = `${currentConf.theme} — Cours ${currentConf.num} — extrait ${positionLabel}`;
    const transcriptText = player.getSelectionText();

    const courseItemKey = await findOrCreateCourseItem(zoteroAuth, currentConf);
    const extractItemKey = await createExtractItem(zoteroAuth, {
      title,
      date: currentConf.created,
      runningTime: positionLabel,
      label: transcriptText,
      url: fragmentShareUrl(fragment),
      courseItemKey,
      source:currentConf.source
    });
    await uploadAttachment(zoteroAuth, extractItemKey, blob, filename);

    extractSuccess.textContent = "Extrait enregistré dans Zotero.";
    extractSuccess.classList.remove("hidden");
  } catch (err) {
    extractError.textContent = "Échec Zotero : " + err.message;
    extractError.classList.remove("hidden");
    console.error(err);
  } finally {
    btnExtractZotero.disabled = false;
  }
}

// --- Authentification Omeka S (email + clé API) ---

function updateAuthUI() {
  const auth = getAuth();
  const connected = !!auth;
  loggedInBox.classList.toggle("hidden", !connected);
  btnAuthToggle.classList.toggle("hidden", connected);
  loginForm.classList.add("hidden");
  collabActions.classList.toggle("hidden", !connected);
  btnOpenAnnotations.classList.toggle("hidden", !connected);
  if (!connected) closeReportPanel();
  if (connected) loggedInName.textContent = `Connecté : ${auth.name}`;
}

btnAuthToggle.addEventListener("click", () => {
  loginForm.classList.toggle("hidden");
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  const email = document.getElementById("login-email").value.trim();
  const identity = document.getElementById("login-identity").value.trim();
  const credential = document.getElementById("login-credential").value.trim();

  try {
    const auth = await login(email, identity, credential);
    if (!auth) {
      loginError.textContent = "Identifiants incorrects.";
      loginError.classList.remove("hidden");
      return;
    }
    loginForm.reset();
    updateAuthUI();
  } catch (err) {
    loginError.textContent = "Connexion impossible.";
    loginError.classList.remove("hidden");
    console.error(err);
  }
});

btnLogout.addEventListener("click", () => {
  logout();
  updateAuthUI();
});

// --- Actions collaboratives (signalement / relance de transcription) ---

collabActions.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-report-type]");
  if (!btn) return;
  openReportPanel(btn.dataset.reportType);
});

function openReportPanel(type) {
  currentReportType = type;
  currentReportTimecode = audioEl.currentTime;
  reportTitle.textContent = type === "relancer"
    ? REPORT_LABELS[type]
    : `${REPORT_LABELS[type]} (à ${formatTime(currentReportTimecode)})`;
  reportError.classList.add("hidden");
  reportModele.classList.toggle("hidden", type !== "relancer");
  reportTexte.classList.toggle("hidden", type === "relancer" || type === "correction");
  reportCorrection.classList.toggle("hidden", type !== "correction");
  reportTexte.value = "";
  reportRemplacer.value = "";
  reportPar.value = "";
  reportSurTout.checked = false;
  reportPanel.classList.remove("hidden");
}

function closeReportPanel() {
  currentReportType = null;
  currentReportTimecode = null;
  reportPanel.classList.add("hidden");
}

btnReportCancel.addEventListener("click", closeReportPanel);

btnReportSubmit.addEventListener("click", async () => {
  const auth = getAuth();
  const fragment = player.fragments[player.index];
  if (!auth || !fragment || !currentReportType) return;

  reportError.classList.add("hidden");
  btnReportSubmit.disabled = true;

  try {
    if (currentReportType === "relancer") {
      await relancerTranscription({ idFrag: fragment.idFrag, modele: reportModele.value, auth });
    } else if (currentReportType === "correction") {
      const remplacer = reportRemplacer.value.trim();
      const par = reportPar.value.trim();
      if (!remplacer) {
        reportError.textContent = "Merci d'indiquer le texte à remplacer.";
        reportError.classList.remove("hidden");
        return;
      }
      const surTout = reportSurTout.checked;
      const texte = `Remplacer « ${remplacer} » par « ${par} »`
        + (surTout ? " (dans tous le cours)" : " (à cet endroit uniquement)");
      await signalerFragment({
        idConf: fragment.idConf,
        idTrans: fragment.idTrans,
        type: currentReportType,
        texte,
        remplacer,
        par,
        surTout,
        timecode: currentReportTimecode,
        lien: fragmentShareUrl(fragment),
        auth,
      });
    } else {
      const surTout = reportSurTout.checked;
      const texte = reportTexte.value.trim();
      if (!texte) {
        reportError.textContent = "Merci de décrire la référence ou la correction.";
        reportError.classList.remove("hidden");
        return;
      }
      await signalerFragment({
        idConf: fragment.idConf,
        idTrans: fragment.idTrans,
        type: currentReportType,
        texte,
        surTout,
        timecode: currentReportTimecode,
        lien: fragmentShareUrl(fragment),
        auth,
      });
    }
    closeReportPanel();
  } catch (err) {
    reportError.textContent = "Échec de l'envoi : " + err.message;
    reportError.classList.remove("hidden");
    console.error(err);
  } finally {
    btnReportSubmit.disabled = false;
  }
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  renderCourseList(search.value.trim());
});

// pas d'appel API à chaque frappe : uniquement si le champ est vidé
// (bouton natif "x" du input[type=search]) on revient à la liste complète
search.addEventListener("search", () => {
  if (!search.value.trim()) renderCourseList("");
});

const ALL_VIEWS = [viewList, viewPlayer, viewHistory, viewAnnotations];

function showView(view) {
  for (const v of ALL_VIEWS) v.classList.toggle("hidden", v !== view);
}

function showList() {
  showView(viewList);
}

function showPlayer() {
  showView(viewPlayer);
}

function showHistory() {
  showView(viewHistory);
  renderHistoryPage();
}

function showAnnotations() {
  showView(viewAnnotations);
  renderAnnotationsPage();
}

function groupByTheme(list) {
  const groups = new Map();
  for (const conf of list) {
    if (!groups.has(conf.theme)) groups.set(conf.theme, []);
    groups.get(conf.theme).push(conf);
  }
  for (const courses of groups.values()) {
    courses.sort((a, b) => Number(a.num) - Number(b.num));
  }
  return groups;
}

function renderHistorySection() {
  const recent = getRecentHistory()
    .map((entry) => ({ ...entry, conf: conferences.find((c) => c.id === entry.idConf) }))
    .filter((entry) => entry.conf)
    .slice(0, 5);
  if (!recent.length) return;

  const section = d3.select(courseGroups).insert("section", ":first-child").attr("class", "theme-group");
  section.append("h3").text("Reprendre l'écoute");
  const li = section.append("ul").attr("class", "course-list").selectAll("li").data(recent).enter()
    .append("li").attr("class", "course-card")
    .on("click", (e, d) => openCourse(d.conf, { jumpToIdTrans: d.idTrans, resumePosition: d.position }));
  li.append("span").attr("class", "course-num").text((d) => d.conf.num);
  const divLi = li.append("div").attr("class", "course-info");
  divLi.append("span").attr("class", "course-promo").text((d) => `${d.conf.theme}`);
  divLi.append("span").attr("class", "course-stats").text((d) => `Reprendre à ${formatTime(d.position)}`);
  li.append("button").attr("class", "history-remove").attr("aria-label", "Retirer de l'historique")
    .html('<i class="fa-solid fa-xmark" aria-hidden="true"></i>')
    .on("click", (e, d) => {
      e.stopPropagation();
      removeProgress(d.idConf);
      renderCourseList(search.value.trim());
    });
}

// Page "Historique des écoutes" : liste complète (contrairement à la section
// "Reprendre l'écoute" de la page d'accueil, limitée aux 5 plus récentes).
function renderHistoryPage() {
  historyGroups.innerHTML = "";

  const recent = getRecentHistory()
    .map((entry) => ({ ...entry, conf: conferences.find((c) => c.id === entry.idConf) }))
    .filter((entry) => entry.conf);

  if (!recent.length) {
    historyGroups.innerHTML = '<p class="status">Aucun cours écouté pour le moment.</p>';
    return;
  }

  const actions = d3.select(historyGroups).append("div").attr("class", "list-actions");
  actions.append("button").attr("class", "auth-link").text("Vider l'historique")
    .on("click", () => {
      clearHistory();
      renderHistoryPage();
    });

  const section = d3.select(historyGroups).append("section").attr("class", "theme-group");
  const li = section.append("ul").attr("class", "course-list").selectAll("li").data(recent).enter()
    .append("li").attr("class", "course-card")
    .on("click", (e, d) => openCourse(d.conf, { jumpToIdTrans: d.idTrans, resumePosition: d.position }));
  li.append("span").attr("class", "course-num").text((d) => d.conf.num);
  const divLi = li.append("div").attr("class", "course-info");
  divLi.append("span").attr("class", "course-promo").text((d) => `${d.conf.theme} — Cours ${d.conf.num}`);
  divLi.append("span").attr("class", "course-sujets").text((d) => dateCours(new Date(d.conf.created)));
  divLi.append("span").attr("class", "course-stats").text((d) =>
    `Reprendre à ${formatTime(d.position)} · le ${new Date(d.updatedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}`
  );
  li.append("button").attr("class", "history-remove").attr("aria-label", "Retirer de l'historique")
    .html('<i class="fa-solid fa-xmark" aria-hidden="true"></i>')
    .on("click", (e, d) => {
      e.stopPropagation();
      removeProgress(d.idConf);
      renderHistoryPage();
    });
}

// Page "Mes annotations" : signalements (corrections / références) créés par
// l'utilisateur connecté, lus directement depuis l'API cœur d'Omeka-S.
const ANNOTATION_TYPE_LABELS = {
  correction: "Correction",
  personne: "Personne",
  oeuvre: "Œuvre",
  date: "Date / période",
  lieu: "Lieu",
};

function mapAnnotation(item) {
  const val = (term) => item[term]?.[0]?.["@value"] ?? null;
  const resourceId = (term) => item[term]?.[0]?.value_resource_id ?? null;
  return {
    id: item["o:id"],
    titre: item["o:title"],
    type: val("dcterms:type"),
    texte: val("dcterms:description"),
    remplacer: val("jdc:remplacer"),
    par: val("jdc:par"),
    timecode: val("dcterms:temporal"),
    status: val("curation:status"),
    idConf: resourceId("dcterms:isPartOf"),
    idTrans: resourceId("dcterms:source"),
    created: item["o:created"]?.["@value"] ?? null,
  };
}

async function renderAnnotationsPage() {
  annotationsGroups.innerHTML = "";
  const auth = getAuth();
  if (!auth || auth.id == null) {
    annotationsGroups.innerHTML = '<p class="status error">Reconnectez-vous à Omeka S pour voir vos annotations.</p>';
    return;
  }

  annotationsGroups.innerHTML = '<p class="status">Chargement…</p>';
  let items;
  try {
    items = await fetchMesAnnotations(auth);
  } catch (err) {
    annotationsGroups.innerHTML = '<p class="status error">Impossible de charger les annotations.</p>';
    console.error(err);
    return;
  }

  const annotations = items.map(mapAnnotation);
  annotationsGroups.innerHTML = "";
  if (!annotations.length) {
    annotationsGroups.innerHTML = '<p class="status">Aucune annotation pour le moment.</p>';
    return;
  }

  const section = d3.select(annotationsGroups).append("section").attr("class", "theme-group");
  const li = section.append("ul").attr("class", "course-list").selectAll("li").data(annotations).enter()
    .append("li").attr("class", (d) => `course-card${d.idConf == null ? " annotation-unlinked" : ""}`)
    .on("click", (e, d) => {
      if (d.idConf == null) return;
      const conf = conferences.find((c) => c.id === d.idConf);
      if (!conf) return;
      openCourse(conf, { jumpToIdTrans: d.idTrans });
    });
  const divLi = li.append("div").attr("class", "course-info");
  const header = divLi.append("div").attr("class", "annotation-header");
  header.append("span").attr("class", "annotation-type").text((d) => ANNOTATION_TYPE_LABELS[d.type] || d.type);
  header.append("span").attr("class", "annotation-status").text((d) => d.status || "").filter((d) => !d.status).remove();
  divLi.append("p").attr("class", "annotation-texte").text((d) =>
    d.type === "correction" ? `Remplacer « ${d.remplacer} » par « ${d.par} »` : d.texte
  );
  divLi.append("span").attr("class", "course-stats").text((d) => {
    const date = d.created ? new Date(d.created).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "";
    return [d.timecode ? `à ${d.timecode}` : "", date].filter(Boolean).join(" · ");
  });
}

function renderCourseCards(list) {
  courseGroups.innerHTML = "";
  renderHistorySection();

  if (list.length === 0) {
    courseGroups.innerHTML = '<p class="status">Aucun cours ne correspond à cette recherche.</p>';
    return;
  }

  const groups = groupByTheme(list);
  for (const [theme, courses] of groups) {
    const section = d3.select(courseGroups).append("section").attr("class","theme-group");
    section.append("h3").text(theme);
    const li = section.append("ul").attr("class","course-list").selectAll("li").data(courses).enter().append("li").attr("class","course-card")
      .on("click",openSearchCourse);
    li.append("span").attr("class","course-num").text(d=>d.num);
    const divLi = li.append("div").attr("class","course-info");
    divLi.append("span").attr("class","course-promo").text(d=>dateCours(new Date(d.created)));
    divLi.append("span").attr("class","course-sujets").text(d=>{
      // conferences est ré-affiché à chaque retour à la liste (historique,
      // recherche vidée…) : parser une seule fois pour ne pas planter au
      // second rendu (d.sujets serait alors déjà un tableau, pas du JSON).
      if (typeof d.sujets === "string") d.sujets = JSON.parse(d.sujets);
      return d.sujets ? d.sujets.map(s=>s.label).join(" - ") : "";
    });
    divLi.filter((d) => d.extrait).append("p").attr("class", "course-excerpt").text((d) => d.extrait);
    const stats = divLi.append("span").attr("class","course-stats").text(d=>{
      return `${d.nbFrag} fragments · ${d.nbConcept} concepts -> `;
    });
    stats.append("img").attr("class","logo1").attr("src","./img/Logo_BnFblanc.svg").on("click",(e,d)=>{
      e.stopPropagation();
      window.open(d.source, "_blank");
    });
  }
}

function dateCours(d){
  const nomsJours = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const nomsMois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  return nomsJours[d.getDay()]+" "+d.getDate()+" "+nomsMois[d.getMonth()]+" "+d.getFullYear();
}
function snippetFromConcepts(concepts, trouve) {
  const text = concepts;//concepts.map((c) => c.title).join(" ");
  const idx = text.toLowerCase().indexOf(trouve.toLowerCase());
  if (idx === -1) return text.slice(0, 160);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + trouve.length + 60);
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + trouve.length);
  const after = text.slice(idx + trouve.length, end);
  return `${start > 0 ? "… " : ""}${before}<mark>${match}</mark>${after}${end < text.length ? " …" : ""}`;
}

function renderSearchResults(hits, trouve) {
  courseGroups.innerHTML = "";

  if (hits.length === 0) {
    courseGroups.innerHTML = '<p class="status">Aucun extrait ne correspond à cette recherche.</p>';
    return;
  }
  //regroupe par thème0
  const themes = Array.from(d3.group(hits, (d) => d.theme));
  //calcule le score total
  themes.forEach(t=>{
    t.score = d3.sum(t[1], (d) => d.score); 
    t.cours = Array.from(d3.group(t[1], (c) => c.idConf));
    t.cours.forEach(gc=>{
      const conf = conferences.find((c) => c.id === gc[0]);
      gc.conf = conf;
      gc.score = d3.sum(gc[1], (d) => d.score); 
    });
    t.cours.sort((a, b) => Number(b.score) - Number(a.score));

  })
  //classe les cours
  themes.sort((a, b) => Number(b.score) - Number(a.score));


  d3.select(courseGroups).append("h3").text(`${hits.length} extrait${hits.length > 1 ? "s" : ""} trouvé${hits.length > 1 ? "s" : ""} dans ${themes.length} thème${themes.length > 1 ? "s" : ""} `);
  //affiche les transcriptions regroupées par themes
  const sections = d3.select(courseGroups).selectAll("section").data(themes).enter().append("section").attr("class","theme-group");
  const titreSect = sections.append("h3").text(d=>d[0]);
  titreSect.append("span").attr("class","course-promo").text(t=>{
    return " : score = "+Math.ceil(t.score)+" / nb. cours = "+t.cours.length;
  })
  //affiche les transcriptions regroupées par cours
  const liCours = sections.append("ul").attr("class","course-list").selectAll("li").data(t=>t.cours).enter().append("li").attr("class", "course-card");
  liCours.append("span").attr("class","course-num").text(d=>d.conf.num);
  const divLi = liCours.append("div").attr("class","course-info");
    divLi.append("span").attr("class","course-promo").text(d=>dateCours(new Date(d.conf.created)));
    divLi.append("span").attr("class","course-sujets").text(c=>{
      return "score = "+Math.ceil(c.score)+" / nb. extraits = "+c[1].length
    });
  //affiche les transcriptions regroupées par cours
  const liTrans = liCours.append("ul").attr("class","trans-list").selectAll("li").data(c=>c[1]).enter().append("li").attr("class", "course-card").html(t=>{
      return `
      <div class="course-info">
        <span class="course-stats">${snippetFromConcepts(t.texte, trouve)}</span>
      </div>
    `;
    }).on("click",openSearchTrans);
}

function openSearchCourse(e,d){
  console.log(d);
  if(d.id)openCourse(d);
  else{
    const conf = conferences.find((c) => c.id === d[0]);
    openCourse(conf);
  }
}

function openSearchTrans(e,d){
  console.log(d);
  const conf = conferences.find((c) => c.id === d.idConf);
  openCourse(conf, { jumpToIdTrans: d.idTrans });
}

let searchRequestToken = 0;

async function renderCourseList(filter = "") {
  if (!filter) {
    renderCourseCards(conferences);
    return;
  }

  const token = ++searchRequestToken;
  courseGroups.innerHTML = '<p class="status">Recherche en cours…</p>';

  let hits;
  try {
    hits = await fetchSearchResults(filter);
  } catch (err) {
    if (token === searchRequestToken) {
      courseGroups.innerHTML = '<p class="status error">La recherche a échoué.</p>';
    }
    console.error(err);
    return;
  }

  // une recherche plus récente a été lancée entre-temps : on ignore ce résultat périmé
  if (token !== searchRequestToken) return;

  renderSearchResults(hits, filter);
}

function playStandaloneFragment(fragment) {
  courseTitleEl.textContent = fragment.theme ? `${fragment.theme} — Cours ${fragment.num}` : "Extrait trouvé";
  courseMetaEl.textContent = "Extrait isolé";
  fragmentCounterEl.textContent = "Chargement…";
  captionsEl.innerHTML = "";
  currentConf = {
    id: fragment.idConf,
    theme: fragment.theme || "Extrait trouvé",
    num: fragment.num || "",
    created: "",
    source: fragment.bnf || "",
    promo: "",
  };
  showPlayer();
  player.load([fragment]);
  player.goTo(0);
}

// Positionne la lecture une fois les métadonnées du fragment chargées (nécessaire :
// modifier currentTime avant que le navigateur les ait lues est ignoré/écrasé).
function resumeAudioAt(position) {
  if (!position) return;
  const onLoaded = () => {
    audioEl.currentTime = position;
    audioEl.removeEventListener("loadedmetadata", onLoaded);
  };
  audioEl.addEventListener("loadedmetadata", onLoaded);
}

async function openCourse(conf, { jumpToIdTrans, resumePosition } = {}) {
  courseTitleEl.textContent = `${conf.theme} — Cours ${conf.num}`;
  courseMetaEl.textContent = `${dateCours(new Date(conf.created))}`;
  fragmentCounterEl.textContent = "Chargement…";
  captionsEl.innerHTML = "";
  currentConf = conf;
  showPlayer();

  try {
    const fragments = await fetchTranscriptions(conf.id);
    player.load(fragments);

    let effectiveJump = jumpToIdTrans;
    let effectivePosition = resumePosition;
    if (!effectiveJump) {
      // pas de lien profond explicite : propose de reprendre où l'écoute s'était arrêtée
      const saved = getProgress(conf.id);
      if (saved) {
        effectiveJump = saved.idTrans;
        effectivePosition = saved.position;
      }
    }

    const startIndex = effectiveJump
      ? Math.max(0, fragments.findIndex((f) => String(f.idTrans) === String(effectiveJump)))
      : 0;
    player.goTo(startIndex);
    resumeAudioAt(effectivePosition);
  } catch (err) {
    fragmentCounterEl.textContent = "Impossible de charger ce cours.";
    console.error(err);
  }
}

async function init() {
  updateAuthUI();
  try {
    conferences = await fetchConferences();

    const params = new URLSearchParams(location.search);
    const idConf = params.get("idConf");
    const idTrans = params.get("idTrans");
    const conf = idConf ? conferences.find((c) => String(c.id) === idConf) : null;

    if (conf) {
      openCourse(conf, { jumpToIdTrans: idTrans });
    } else {
      renderCourseList();
    }
  } catch (err) {
    courseGroups.innerHTML = '<p class="status error">Impossible de charger la liste des cours.</p>';
    console.error(err);
  }
}

// --- Vérification des mises à jour de l'application (service worker) ---
//
// Le service worker installe la nouvelle version en tâche de fond mais reste
// "en attente" (voir sw.js) tant que l'utilisateur n'a pas confirmé, pour ne
// pas changer le code qui tourne sous ses pieds sans prévenir. On propose la
// mise à jour dès qu'une nouvelle version est prête, et on vérifie
// régulièrement s'il y en a une (au chargement, au retour au premier plan,
// puis toutes les heures pour un onglet resté ouvert longtemps).
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let swRegistration = null;

function showUpdateBanner(registration) {
  updateBanner.classList.remove("hidden");
  btnUpdate.onclick = () => {
    btnUpdate.disabled = true;
    if (registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
  };
}

function showUpdateCheckStatus(message, isError = false) {
  updateCheckStatus.textContent = message;
  updateCheckStatus.classList.toggle("error", isError);
  updateCheckStatus.classList.remove("hidden");
  clearTimeout(showUpdateCheckStatus.timer);
  showUpdateCheckStatus.timer = setTimeout(() => updateCheckStatus.classList.add("hidden"), 4000);
}

// Vérification manuelle (bouton de la page d'accueil) : la vérification
// automatique ci-dessous tourne déjà en tâche de fond, mais un bouton explicite
// rassure l'utilisateur qui veut être sûr d'avoir la dernière version tout de
// suite. registration.update() ne dit pas s'il a trouvé une nouvelle version :
// on laisse le temps au listener "updatefound" de réagir, puis on affiche un
// message "déjà à jour" seulement si aucun bandeau n'est apparu entre-temps.
function checkForUpdatesManually() {
  if (!swRegistration) {
    showUpdateCheckStatus("Vérification impossible sur cet appareil.", true);
    return;
  }
  btnCheckUpdate.disabled = true;
  showUpdateCheckStatus("Vérification des mises à jour…");
  swRegistration.update()
    .then(() => {
      setTimeout(() => {
        btnCheckUpdate.disabled = false;
        if (updateBanner.classList.contains("hidden")) {
          showUpdateCheckStatus("Vous avez déjà la dernière version.");
        }
      }, 1500);
    })
    .catch(() => {
      btnCheckUpdate.disabled = false;
      showUpdateCheckStatus("Vérification impossible.", true);
    });
}

btnCheckUpdate.addEventListener("click", checkForUpdatesManually);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then((registration) => {
    swRegistration = registration;

    // Une version est peut-être déjà en attente (ex. onglet resté ouvert
    // pendant l'installation d'une mise à jour précédente).
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(registration);
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // "installed" + un controller déjà actif = ce n'est pas la première
        // installation mais bien une mise à jour d'une version déjà en cours.
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(registration);
        }
      });
    });

    const checkForUpdate = () => registration.update().catch(() => {});
    checkForUpdate();
    setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkForUpdate();
    });
  }).catch(() => {});

  // Le nouveau service worker vient de prendre le contrôle (après SKIP_WAITING) :
  // on recharge pour que la page utilise la nouvelle version du code.
  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    location.reload();
  });
}

init();
