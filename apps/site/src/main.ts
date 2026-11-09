import type { Vibe } from "@u-cut/schema";
import { ReelPlayer } from "../../web/src/stage/player.ts";
import { cut, firstPrompt, type Request, type Way } from "./reels.ts";
import "./style.css";

const sizes = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

const element = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

const frame = element<HTMLElement>(".stage-frame");
const host = element<HTMLElement>(".stage-host");
const room = element<HTMLElement>(".stage");
const note = element<HTMLElement>(".stage-note");
const playButton = element<HTMLButtonElement>(".stage-play");
const soundButton = element<HTMLButtonElement>(".stage-sound");
const remixButton = element<HTMLButtonElement>(".stage-remix");
const form = element<HTMLFormElement>(".try");
const field = element<HTMLTextAreaElement>(".try textarea");
const ways = [...document.querySelectorAll<HTMLElement>(".way")];
const vibeButtons = [...document.querySelectorAll<HTMLButtonElement>(".vibe")];

const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const player = new ReelPlayer(host);
player.setMuted(true);

const request: Request = { way: "sentence", prompt: firstPrompt, vibe: null, seed: 1 };
let sound = false;
let onScreen = true;
let width = sizes["9:16"].width;
let bpm = 84;
let track = "";

function fit() {
  host.style.transform = `scale(${frame.clientWidth / width})`;
}
new ResizeObserver(fit).observe(frame);

function setPlaying(playing: boolean) {
  playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  playButton.dataset.playing = String(playing);
}
player.onPlayingChange = setPlaying;

player.onTick = (time) => {
  // The light behind the reel breathes with the music, as it does in the app.
  const phase = (time * bpm) / 60;
  room.style.setProperty("--beat", Math.exp(-(phase % 1) * 4.5).toFixed(3));
};

function show() {
  const started = performance.now();
  const { plan, composition, note: about } = cut(request);
  const size = sizes[plan.aspect];
  width = size.width;
  bpm = plan.music.bpm ?? 100;
  track = plan.music.src;
  frame.dataset.shape = plan.aspect;
  frame.style.aspectRatio = `${size.width} / ${size.height}`;
  host.style.width = `${size.width}px`;
  host.style.height = `${size.height}px`;
  fit();
  // Music and effects are only fetched once someone asks for sound.
  player.load(
    composition,
    sound ? plan : { ...plan, sfx: [] },
    sound ? `/media/music/${track}` : "",
    {
      soundUrl: (src) => `/media/sfx/${src}`,
    },
  );
  const took = Math.max(1, Math.round(performance.now() - started));
  note.textContent = `${about}. Cut in ${took} ms, in this page.`;
  for (const button of vibeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.vibe === plan.vibe));
    button.disabled = request.way === "recording" || request.way === "reference";
  }
  if (onScreen && !stillMotion) player.play();
}

function choose(way: Way) {
  if (request.way === way) return;
  request.way = way;
  for (const item of ways) item.classList.toggle("is-on", item.dataset.way === way);
  show();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = field.value.trim();
  if (!prompt) return;
  request.prompt = prompt;
  request.vibe = null;
  request.way = "sentence";
  for (const item of ways) item.classList.toggle("is-on", item.dataset.way === "sentence");
  show();
});

/** A long sentence wraps on a phone, so the box grows to show all of it. */
function fitField() {
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}
field.addEventListener("input", fitField);
new ResizeObserver(fitField).observe(field);

field.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

for (const button of vibeButtons) {
  button.addEventListener("click", () => {
    request.vibe = button.dataset.vibe as Vibe;
    show();
  });
}

function remix() {
  request.seed += 1;
  frame.classList.remove("is-cut");
  void frame.offsetWidth;
  frame.classList.add("is-cut");
  show();
}
remixButton.addEventListener("click", remix);
window.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName);
  if (event.key.toLowerCase() === "r" && !typing && !event.metaKey && !event.ctrlKey) remix();
});

playButton.addEventListener("click", () => player.toggle());

// Music is only fetched once someone asks for sound.
soundButton.addEventListener("click", () => {
  sound = !sound;
  soundButton.setAttribute("aria-pressed", String(sound));
  soundButton.textContent = sound ? "Sound on" : "Sound off";
  player.setMuted(!sound);
  if (sound) show();
});

for (const way of ways) {
  way.addEventListener("click", () => choose(way.dataset.way as Way));
}

// The reel re-cuts itself as each way of starting reaches the middle of the screen.
const reading = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) choose((entry.target as HTMLElement).dataset.way as Way);
    }
  },
  { rootMargin: "-40% 0px -50% 0px" },
);
for (const way of ways) reading.observe(way);

// No point spending a battery on a reel nobody can see.
new IntersectionObserver(([entry]) => {
  onScreen = entry?.isIntersecting ?? true;
  if (!onScreen) player.pause();
  else if (!stillMotion) player.play();
}).observe(frame);

for (const button of document.querySelectorAll<HTMLButtonElement>(".copy")) {
  button.addEventListener("click", async () => {
    const text = button.previousElementSibling?.textContent?.trim() ?? "";
    await navigator.clipboard.writeText(text).catch(() => {});
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1800);
  });
}

show();
if (stillMotion) {
  setPlaying(false);
  player.seek(3);
}
