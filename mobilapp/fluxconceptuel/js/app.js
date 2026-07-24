import { fetchConferences, fetchTranscriptions, fetchSearchResults, signalerFragment, relancerTranscription } from "./api.js";
import { login, logout, getAuth } from "./auth.js";
import { Player } from "./player.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const viewList = document.getElementById("view-list");
const viewPlayer = document.getElementById("view-player");
const courseGroups = document.getElementById("course-groups");
const searchForm = document.getElementById("search-form");
const search = document.getElementById("search");

const audioEl = document.getElementById("audio");
const captionsEl = document.getElementById("captions");
const courseTitleEl = document.getElementById("course-title");
const courseMetaEl = document.getElementById("course-meta");
const fragmentCounterEl = document.getElementById("fragment-counter");
const progressFillEl = document.getElementById("progress-fill");
const btnPlay = document.getElementById("btn-play");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnBack = document.getElementById("btn-back");
const btnCopyRef = document.getElementById("btn-copy-ref");
const btnShare = document.getElementById("btn-share");

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

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const player = new Player(audioEl, captionsEl, {
  onFragmentChange: (index, total, fragment) => {
    fragmentCounterEl.textContent = `Fragment ${index + 1} / ${total}`;
    progressFillEl.style.width = "0%";
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === total - 1;
    btnCopyRef.disabled = !mediaFragmentUrl(fragment);
    btnCopyRef.classList.remove("copied");
    btnCopyRef.textContent = "Copier la référence du fragment";
    btnShare.disabled = !fragmentShareUrl(fragment);
    btnShare.classList.remove("copied");
    btnShare.textContent = "Partager ce fragment";
    closeReportPanel();
  },
  onProgress: (ratio) => {
    progressFillEl.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  },
  onCourseEnd: () => {
    btnPlay.textContent = "▶";
    fragmentCounterEl.textContent = "Cours terminé";
  },
});

audioEl.addEventListener("play", () => (btnPlay.textContent = "⏸"));
audioEl.addEventListener("pause", () => (btnPlay.textContent = "▶"));

btnPlay.addEventListener("click", () => player.toggle());
btnPrev.addEventListener("click", () => player.goTo(player.index - 1));
btnNext.addEventListener("click", () => player.goTo(player.index + 1));
btnBack.addEventListener("click", () => {
  audioEl.pause();
  showList();
});

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
    btnCopyRef.textContent = "Référence copiée !";
    btnCopyRef.classList.add("copied");
    setTimeout(() => {
      btnCopyRef.textContent = "Copier la référence du fragment";
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
    btnShare.textContent = "Lien copié !";
    btnShare.classList.add("copied");
    setTimeout(() => {
      btnShare.textContent = "Partager ce fragment";
      btnShare.classList.remove("copied");
    }, 1500);
  } catch (err) {
    console.error(err);
  }
});

// --- Authentification Omeka S (email + clé API) ---

function updateAuthUI() {
  const auth = getAuth();
  const connected = !!auth;
  loggedInBox.classList.toggle("hidden", !connected);
  btnAuthToggle.classList.toggle("hidden", connected);
  loginForm.classList.add("hidden");
  collabActions.classList.toggle("hidden", !connected);
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
  reportTexte.classList.toggle("hidden", type === "relancer");
  reportTexte.value = "";
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
    } else {
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

function showList() {
  viewPlayer.classList.add("hidden");
  viewList.classList.remove("hidden");
}

function showPlayer() {
  viewList.classList.add("hidden");
  viewPlayer.classList.remove("hidden");
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

function renderCourseCards(list) {
  courseGroups.innerHTML = "";

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
      d.sujets = JSON.parse(d.sujets);
      return d.sujets ? d.sujets.map(s=>s.label).join(" - ") : "";
    });
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
    return " : score = "+Math.ceil(t.score)+" nb. cours ="+t.cours.length;
  })
  //affiche les transcriptions regroupées par cours
  const liCours = sections.append("ul").attr("class","course-list").selectAll("li").data(t=>t.cours).enter().append("li").attr("class", "course-card");
  liCours.append("span").attr("class","course-num").text(d=>d.conf.num);
  const divLi = liCours.append("div").attr("class","course-info");
    divLi.append("span").attr("class","course-promo").text(d=>dateCours(new Date(d.conf.created)));
    divLi.append("span").attr("class","course-sujets").text(c=>{
      return "score = "+Math.ceil(c.score)+" nb. extraits = "+c[1].length
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
  showPlayer();
  player.load([fragment]);
  player.goTo(0);
}

async function openCourse(conf, { jumpToIdTrans } = {}) {
  courseTitleEl.textContent = `${conf.theme} — Cours ${conf.num}`;
  courseMetaEl.textContent = `${dateCours(new Date(conf.created))}`;
  fragmentCounterEl.textContent = "Chargement…";
  captionsEl.innerHTML = "";
  showPlayer();

  try {
    const fragments = await fetchTranscriptions(conf.id);
    player.load(fragments);
    const startIndex = jumpToIdTrans
      ? Math.max(0, fragments.findIndex((f) => String(f.idTrans) === String(jumpToIdTrans)))
      : 0;
    player.goTo(startIndex);
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
