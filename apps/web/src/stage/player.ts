import { type Composition, musicSegments } from "@u-cut/compose";
import type { EditPlan } from "@u-cut/schema";

interface Clip {
  element: HTMLElement;
  start: number;
  end: number;
}

interface VideoClip extends Clip {
  element: HTMLVideoElement;
  mediaStart: number;
}

const driftLimit = 0.22;

/**
 * Plays a composition live in the browser, using the exact HTML and CSS the final render uses.
 * Everything visible is a function of the time, so seeking and looping are always exact.
 */
export class ReelPlayer {
  readonly duration: () => number;
  onTick: (time: number) => void = () => {};
  onPlayingChange: (playing: boolean) => void = () => {};

  private readonly shadow: ShadowRoot;
  private readonly audio = new Audio();
  private plan: EditPlan | null = null;
  private clips: Clip[] = [];
  private videos: VideoClip[] = [];
  private animations: Animation[] = [];
  private time = 0;
  private playing = false;
  private lastFrame = 0;
  private frame = 0;
  private muted = false;
  private readonly voices = new Map<string, HTMLAudioElement>();
  private effects: { sound: EditPlan["sfx"][number]; audio: HTMLAudioElement }[] = [];

  constructor(host: HTMLElement) {
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    this.audio.preload = "auto";
    this.duration = () => this.plan?.duration ?? 0;
  }

  load(
    composition: Composition,
    plan: EditPlan,
    musicUrl: string,
    options: { keepTime?: boolean; soundUrl?: (src: string) => string } = {},
  ) {
    const trackChanged = !this.audio.src.endsWith(musicUrl);
    this.plan = plan;
    this.shadow.innerHTML = `<style>${composition.css}</style>${composition.root}`;

    const timing = (element: HTMLElement) => {
      const start = Number(element.dataset.start ?? 0);
      return { element, start, end: start + Number(element.dataset.duration ?? 0) };
    };
    this.clips = [...this.shadow.querySelectorAll<HTMLElement>(".clip")].map(timing);
    this.videos = [...this.shadow.querySelectorAll<HTMLVideoElement>("video")].map((element) => {
      element.preload = "auto";
      element.muted = this.muted || element.dataset.hasAudio !== "true";
      return { ...timing(element), element, mediaStart: Number(element.dataset.mediaStart ?? 0) };
    });
    this.animations = this.shadow.getAnimations();
    for (const animation of this.animations) animation.pause();

    if (trackChanged) {
      this.audio.src = musicUrl;
      this.audio.load();
    }
    this.loadVoices(plan);
    this.loadEffects(plan, options.soundUrl ?? ((src) => `/sfx/${src}`));
    if (!options.keepTime) this.time = 0;
    this.time = Math.min(this.time, Math.max(0, plan.duration - 0.01));
    this.syncAudio(true);
    this.render(true);
  }

  /** Keeps lines that haven't changed, so editing one doesn't reload the rest. */
  private loadVoices(plan: EditPlan) {
    const wanted = new Set((plan.voice ?? []).map((line) => line.src));
    for (const [src, audio] of this.voices) {
      if (wanted.has(src)) continue;
      audio.pause();
      this.voices.delete(src);
    }
    for (const src of wanted) {
      if (this.voices.has(src)) continue;
      const audio = new Audio(`/voice/${src}`);
      audio.preload = "auto";
      audio.muted = this.muted;
      this.voices.set(src, audio);
    }
  }

  /** One player per sound effect. The browser caches the files, so reloading them is cheap. */
  private loadEffects(plan: EditPlan, soundUrl: (src: string) => string) {
    for (const effect of this.effects) effect.audio.pause();
    this.effects = plan.sfx.map((sound) => {
      const audio = new Audio(soundUrl(sound.src));
      audio.preload = "auto";
      audio.muted = this.muted;
      audio.volume = Math.min(1, sound.vol);
      return { sound, audio };
    });
  }

  /** Changes the words on screen without touching anything else. */
  setTitle(text: string): boolean {
    const title = this.shadow.querySelector(".text-title span");
    if (!title) return false;
    title.textContent = text;
    return true;
  }

  play() {
    if (this.playing || !this.plan) return;
    this.playing = true;
    this.lastFrame = performance.now();
    this.syncAudio(true);
    this.onPlayingChange(true);
    this.frame = requestAnimationFrame(this.step);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.audio.pause();
    for (const voice of this.voices.values()) voice.pause();
    for (const effect of this.effects) effect.audio.pause();
    for (const video of this.videos) video.element.pause();
    this.onPlayingChange(false);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number) {
    this.time = Math.max(0, Math.min(time, this.duration()));
    this.syncAudio(true);
    this.render(true);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.audio.muted = muted;
    for (const voice of this.voices.values()) voice.muted = muted;
    for (const effect of this.effects) effect.audio.muted = muted;
    for (const { element } of this.videos) {
      element.muted = muted || element.dataset.hasAudio !== "true";
    }
  }

  isMuted() {
    return this.muted;
  }

  isPlaying() {
    return this.playing;
  }

  destroy() {
    this.pause();
    for (const voice of this.voices.values()) voice.pause();
    this.voices.clear();
    for (const effect of this.effects) effect.audio.pause();
    this.effects = [];
    this.audio.removeAttribute("src");
    this.audio.load();
    this.shadow.innerHTML = "";
  }

  private readonly step = (now: number) => {
    if (!this.playing) return;
    this.time += Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.time >= this.duration()) {
      // Reels loop, as they do on the phone they're made for.
      this.time = 0;
      this.syncAudio(true);
    } else {
      this.syncAudio(false);
    }
    this.render(false);
    this.frame = requestAnimationFrame(this.step);
  };

  private syncVoices(force: boolean) {
    for (const line of this.plan?.voice ?? []) {
      const audio = this.voices.get(line.src);
      if (!audio) continue;
      const target = this.time - line.at;
      const speaking = target >= 0 && target < line.length;
      if (speaking && (force || Math.abs(audio.currentTime - target) > driftLimit)) {
        if (audio.readyState > 0) audio.currentTime = target;
      }
      if (speaking && this.playing && audio.paused) void audio.play().catch(() => {});
      if ((!speaking || !this.playing) && !audio.paused) audio.pause();
    }
  }

  /** Each effect plays while the playhead is inside it, the way the render mixes it. */
  private syncEffects(force: boolean) {
    for (const { sound, audio } of this.effects) {
      const target = this.time - sound.at;
      const sounding = target >= 0 && target < sound.length;
      if (sounding && (force || Math.abs(audio.currentTime - target) > driftLimit)) {
        if (audio.readyState > 0) audio.currentTime = target;
      }
      if (sounding && this.playing && audio.paused) void audio.play().catch(() => {});
      if ((!sounding || !this.playing) && !audio.paused) audio.pause();
    }
  }

  private syncAudio(force: boolean) {
    const plan = this.plan;
    if (!plan) return;
    this.syncVoices(force);
    this.syncEffects(force);
    const segment = musicSegments(plan).find(
      (candidate) => this.time >= candidate.at && this.time < candidate.at + candidate.length,
    );
    if (!segment) return;
    const target = segment.from + (this.time - segment.at);
    if (force || Math.abs(this.audio.currentTime - target) > driftLimit) {
      if (this.audio.readyState > 0) this.audio.currentTime = target;
      else
        this.audio.addEventListener(
          "loadedmetadata",
          () => {
            this.audio.currentTime = target;
          },
          { once: true },
        );
    }
    const fade = plan.transitions.find((transition) => transition.type === "fade");
    const fading = fade ? Math.max(0, (this.time - fade.at) / fade.duration) : 0;
    this.audio.volume = Math.max(0, 1 - fading) * (plan.music.volume ?? 1);
    if (this.playing && this.audio.paused) void this.audio.play().catch(() => {});
    if (!this.playing && !this.audio.paused) this.audio.pause();
  }

  private render(exact: boolean) {
    const time = this.time;
    for (const clip of this.clips) {
      clip.element.style.visibility = time >= clip.start && time < clip.end ? "visible" : "hidden";
    }
    for (const animation of this.animations) {
      const target = (animation.effect as KeyframeEffect | null)?.target as HTMLElement | null;
      // Something inside a timed element moves on that element's clock.
      const clip = target?.closest<HTMLElement>("[data-start]");
      const start = Number(clip?.dataset.start ?? 0);
      animation.currentTime = Math.max(0, time - start) * 1000;
    }
    for (const video of this.videos) {
      const active = time >= video.start && time < video.end;
      const target = video.mediaStart + (time - video.start);
      const { element } = video;
      if (active) {
        if (exact || Math.abs(element.currentTime - target) > driftLimit)
          element.currentTime = target;
        if (this.playing && element.paused) void element.play().catch(() => {});
        if (!this.playing && !element.paused) element.pause();
      } else {
        if (!element.paused) element.pause();
        // Parks the next clip on its first frame, so the cut lands cleanly.
        if (time > video.start - 1 && time < video.start) element.currentTime = video.mediaStart;
      }
    }
    this.onTick(time);
  }
}
