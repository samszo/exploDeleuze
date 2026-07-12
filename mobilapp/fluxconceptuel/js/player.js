import { mediaUrl } from "./api.js";

export class Player {
  constructor(audioEl, captionEl, callbacks = {}) {
    this.audio = audioEl;
    this.captionEl = captionEl;
    this.onFragmentChange = callbacks.onFragmentChange || (() => {});
    this.onProgress = callbacks.onProgress || (() => {});
    this.onCourseEnd = callbacks.onCourseEnd || (() => {});

    this.fragments = [];
    this.index = -1;
    this.words = [];
    this.activeWordIndex = -1;

    this.audio.addEventListener("timeupdate", () => this._onTimeUpdate());
    this.audio.addEventListener("ended", () => this._onEnded());
  }

  load(fragments) {
    this.fragments = fragments;
    this.index = -1;
  }

  get total() {
    return this.fragments.length;
  }

  goTo(index, { autoplay = true } = {}) {
    if (index < 0 || index >= this.fragments.length) return;
    this.index = index;
    const fragment = this.fragments[index];

    this.audio.src = mediaUrl(fragment.source);
    this._renderCaptions(fragment.concepts);
    this.onFragmentChange(index, this.total, fragment);

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

  _renderCaptions(concepts) {
    this.captionEl.innerHTML = "";
    this.activeWordIndex = -1;
    this.words = concepts.map((concept) => {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = concept.title;
      span.dataset.start = concept.start;
      span.dataset.end = concept.end;
      span.addEventListener("click", () => this.seekTo(Number(concept.start)));
      this.captionEl.appendChild(span);
      return { el: span, start: Number(concept.start), end: Number(concept.end) };
    });
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
