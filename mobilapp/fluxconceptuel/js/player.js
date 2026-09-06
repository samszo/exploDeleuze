import { mediaUrl } from "./api.js?v=19";

export class Player {
  constructor(audioEl, captionEl, callbacks = {}) {
    this.audio = audioEl;
    this.captionEl = captionEl;
    this.onFragmentChange = callbacks.onFragmentChange || (() => {});
    this.onProgress = callbacks.onProgress || (() => {});
    this.onCourseEnd = callbacks.onCourseEnd || (() => {});
    this.onSelectionChange = callbacks.onSelectionChange || (() => {});
    this.onGlobalProgress = callbacks.onGlobalProgress || (() => {});

    this.fragments = [];
    this.index = -1;
    this.words = [];
    this.activeWordIndex = -1;

    this.selectionMode = false;
    this.selectionStartIndex = null;
    this.selectionEndIndex = null;

    this.audio.addEventListener("timeupdate", () => this._onTimeUpdate());
    this.audio.addEventListener("ended", () => this._onEnded());
  }

  // Active/désactive le mode sélection de mots (pour l'extraction d'un extrait audio).
  // En mode sélection, cliquer un mot définit les bornes de l'extrait au lieu de
  // déplacer la lecture.
  setSelectionMode(active) {
    this.selectionMode = active;
    this._clearSelection();
  }

  getSelectionRange() {
    if (this.selectionStartIndex === null) return null;
    return {
      start: this.words[this.selectionStartIndex],
      end: this.selectionEndIndex === null ? null : this.words[this.selectionEndIndex],
    };
  }

  // Texte transcrit couvert par la sélection (mots + ponctuation/liaisons entre eux),
  // reconstitué dans l'ordre du DOM pour rester fidèle au texte affiché.
  getSelectionText() {
    const range = this.getSelectionRange();
    if (!range || !range.end) return "";
    const nodes = Array.from(this.captionEl.childNodes);
    const startIdx = nodes.indexOf(range.start.el);
    const endIdx = nodes.indexOf(range.end.el);
    if (startIdx === -1 || endIdx === -1) return "";
    return nodes.slice(startIdx, endIdx + 1).map((n) => n.textContent).join("").trim();
  }

  _clearSelection() {
    for (const w of this.words) w.el.classList.remove("selected");
    this.selectionStartIndex = null;
    this.selectionEndIndex = null;
    this.onSelectionChange(null);
  }

  _handleWordSelect(index) {
    if (this.selectionStartIndex === null) {
      this.selectionStartIndex = index;
    } else if (this.selectionEndIndex === null) {
      if (index >= this.selectionStartIndex) {
        this.selectionEndIndex = index;
      } else {
        this.selectionStartIndex = index;
      }
    } else {
      for (const w of this.words) w.el.classList.remove("selected");
      this.selectionStartIndex = index;
      this.selectionEndIndex = null;
    }

    for (let i = 0; i < this.words.length; i++) {
      const inRange = this.selectionEndIndex !== null
        ? i >= this.selectionStartIndex && i <= this.selectionEndIndex
        : i === this.selectionStartIndex;
      this.words[i].el.classList.toggle("selected", inRange);
    }

    this.onSelectionChange(this.getSelectionRange());
  }

  load(fragments) {
    this.fragments = fragments;
    this.index = -1;

    // Position cumulée de chaque fragment dans la durée totale du cours (somme des
    // durées de tous les fragments qui le précèdent dans l'ordre de lecture), pour
    // afficher un temps écoulé/total global plutôt que seulement local au fragment.
    this.cumulativeOffsets = [];
    let sum = 0;
    for (const f of fragments) {
      this.cumulativeOffsets.push(sum);
      sum += Math.max(0, Number(f.end) - Number(f.start)) || 0;
    }
    this.totalDuration = sum;
  }

  get total() {
    return this.fragments.length;
  }

  goTo(index, { autoplay = true } = {}) {
    if (index < 0 || index >= this.fragments.length) return;
    this.index = index;
    const fragment = this.fragments[index];

    this.audio.src = mediaUrl(fragment.source);
    this._renderCaptions(fragment);
    this.onFragmentChange(index, this.total, fragment);
    this.onGlobalProgress(this.cumulativeOffsets[index] || 0, this.totalDuration);

    if (autoplay) {
      this.audio.play().catch(() => {});
    }
  }

  next() {
    this.goTo(this.index + 1);
  }

  prev() {
    this.goTo(this.index - 1);
  }

  toggle() {
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  }

  seekTo(seconds) {
    this.audio.currentTime = seconds;
  }

  _renderCaptions(fragment) {
    this.captionEl.innerHTML = "";
    this.activeWordIndex = -1;
    this.words = [];
    this.selectionStartIndex = null;
    this.selectionEndIndex = null;

    const concepts = fragment.concepts || [];
    const texte = (fragment.texte || "").trim();

    const onWordClick = (index) => {
      if (this.selectionMode) this._handleWordSelect(index);
      else this.seekTo(this.words[index].start);
    };

    if (!texte) {
      // repli : pas de texte complet disponible, on affiche les concepts isolés
      this.words = concepts.map((concept, index) => {
        const span = document.createElement("span");
        span.className = "word";
        span.textContent = concept.title;
        span.addEventListener("click", () => onWordClick(index));
        this.captionEl.appendChild(span);
        return { el: span, start: Number(concept.start), end: Number(concept.end) };
      });
      return;
    }

    for (const segment of alignConceptsWithText(texte, concepts)) {
      if (segment.concept) {
        const span = document.createElement("span");
        span.className = "word";
        span.textContent = segment.text;
        const index = this.words.length;
        span.addEventListener("click", () => onWordClick(index));
        this.captionEl.appendChild(span);
        this.words.push({
          el: span,
          start: Number(segment.concept.start),
          end: Number(segment.concept.end),
        });
      } else {
        this.captionEl.appendChild(document.createTextNode(segment.text));
      }
    }
  }

  _onTimeUpdate() {
    const t = this.audio.currentTime;

    // avance depuis le mot actif précédent (déplacement normal en lecture),
    // sinon recherche complète (après un saut/seek en arrière)
    let i = this.activeWordIndex >= 0 ? this.activeWordIndex : 0;
    if (i > 0 && t < this.words[i]?.start) i = 0;

    let found = -1;
    for (; i < this.words.length; i++) {
      const w = this.words[i];
      if (t >= w.start && t <= w.end) {
        found = i;
        break;
      }
      if (w.start > t) break;
    }

    if (found !== this.activeWordIndex) {
      if (this.activeWordIndex >= 0 && this.words[this.activeWordIndex]) {
        this.words[this.activeWordIndex].el.classList.remove("active");
      }
      if (found >= 0) {
        this.words[found].el.classList.add("active");
        this.words[found].el.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
      this.activeWordIndex = found;
    }

    const fragment = this.fragments[this.index];
    if (fragment) {
      const duration = Number(fragment.end) - Number(fragment.start) || this.audio.duration || 1;
      this.onProgress(t / duration);
      this.onGlobalProgress((this.cumulativeOffsets[this.index] || 0) + t, this.totalDuration);
    }
  }

  _onEnded() {
    if (this.index + 1 < this.total) {
      this.next();
    } else {
      this.onCourseEnd();
    }
  }
}

function normalize(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Aligne les tokens ASR de `concepts` (mots ou ponctuation isolés, sans casse/accents
// fiables) avec le texte complet et ponctué `texte`, en avançant un curseur qui ne
// recule jamais. Renvoie une suite de segments couvrant tout `texte` sans rien perdre :
// { text, concept } pour un mot retrouvé, { text, concept: null } pour les à-côtés
// (ponctuation, espaces, liaisons) qui ne portent pas d'horodatage propre.
function alignConceptsWithText(texte, concepts) {
  const hay = normalize(texte);
  const segments = [];
  let cursor = 0;

  for (const concept of concepts) {
    const needle = normalize(String(concept.title || "").trim());
    if (!needle) continue;

    // recherche dans `hay` en entier (pas une sous-chaîne) pour que \b évalue
    // correctement le contexte gauche au niveau du curseur.
    const escaped = escapeRegex(needle);
    const patterns = [`\\b${escaped}\\b`, `\\b${escaped}`, escaped];

    let start = -1;
    for (const pattern of patterns) {
      const re = new RegExp(pattern, "gi");
      re.lastIndex = cursor;
      const match = re.exec(hay);
      if (match) {
        start = match.index;
        break;
      }
    }
    if (start === -1) continue; // token introuvable : on l'ignore, le texte reste intact

    const end = start + needle.length;
    if (start > cursor) {
      segments.push({ text: texte.slice(cursor, start), concept: null });
    }
    segments.push({ text: texte.slice(start, end), concept });
    cursor = end;
  }

  if (cursor < texte.length) {
    segments.push({ text: texte.slice(cursor), concept: null });
  }

  return segments;
}
