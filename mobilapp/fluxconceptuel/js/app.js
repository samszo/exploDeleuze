import { fetchConferences, fetchTranscriptions } from "./api.js";
import { Player } from "./player.js";

const viewList = document.getElementById("view-list");
const viewPlayer = document.getElementById("view-player");
const courseGroups = document.getElementById("course-groups");
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

let conferences = [];

const player = new Player(audioEl, captionsEl, {
  onFragmentChange: (index, total, fragment) => {
    fragmentCounterEl.textContent = `Fragment ${index + 1} / ${total}`;
    progressFillEl.style.width = "0%";
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === total - 1;
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

search.addEventListener("input", () => renderCourseList(search.value.trim().toLowerCase()));

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

function renderCourseList(filter = "") {
  const filtered = filter
    ? conferences.filter(
        (c) =>
          c.titre.toLowerCase().includes(filter) ||
          c.theme.toLowerCase().includes(filter) ||
          c.promo.toLowerCase().includes(filter)
      )
    : conferences;

  courseGroups.innerHTML = "";

  if (filtered.length === 0) {
    courseGroups.innerHTML = '<p class="status">Aucun cours ne correspond à cette recherche.</p>';
    return;
  }

  const groups = groupByTheme(filtered);
  for (const [theme, courses] of groups) {
    const section = document.createElement("section");
    section.className = "theme-group";

    const heading = document.createElement("h3");
    heading.textContent = theme;
    section.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "course-list";
    for (const conf of courses) {
      const li = document.createElement("li");
      li.className = "course-card";
      li.innerHTML = `
        <span class="course-num">${conf.num}</span>
        <div class="course-info">
          <span class="course-promo">${conf.promo} · ${conf.created}</span>
          <span class="course-stats">${conf.nbFrag} fragments · ${conf.nbConcept} concepts</span>
        </div>
        <div class="course-info">
          <a href="${conf.source}" target="_blank"><img class="logo1" src="img/Logo_BnFblanc.svg"</img></a>
        </div>
        <div class="course-info">
          <a href="${conf.nbConcept}" target="_blank"><img class="logo2" src="img/OmekaS.png"</img></a>
        </div>
      `;
      li.addEventListener("click", () => openCourse(conf));
      ul.appendChild(li);
    }
    section.appendChild(ul);
    courseGroups.appendChild(section);
  }
}

async function openCourse(conf) {
  courseTitleEl.textContent = `${conf.theme} — Cours ${conf.num}`;
  courseMetaEl.textContent = `${conf.promo} · ${conf.created}`;
  fragmentCounterEl.textContent = "Chargement…";
  captionsEl.innerHTML = "";
  showPlayer();

  try {
    const fragments = await fetchTranscriptions(conf.id);
    player.load(fragments);
    player.goTo(0);
  } catch (err) {
    fragmentCounterEl.textContent = "Impossible de charger ce cours.";
    console.error(err);
  }
}

async function init() {
  try {
    conferences = await fetchConferences();
    renderCourseList();
  } catch (err) {
    courseGroups.innerHTML = '<p class="status error">Impossible de charger la liste des cours.</p>';
    console.error(err);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
