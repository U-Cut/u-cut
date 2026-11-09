import type {
  BeatGrid,
  Demo,
  EditPlan,
  MediaItem,
  Script,
  StyleRecipe,
  TemplateManifest,
  Vibe,
} from "@u-cut/schema";

export interface Track {
  file: string;
  vibe: Vibe;
  bpm: number;
  length: number;
  beats: BeatGrid;
}

export interface Catalog {
  templates: {
    manifest: TemplateManifest;
    css: string;
    /** One line on what it's for, from its README. */
    summary: string;
    /** Its moving preview. */
    preview: string;
    /** How it's made. Only photo styles appear in the gallery. */
    madeBy: "photos" | "recording" | "words" | "reference";
    /** Added after installing, from U-Cut's library on GitHub. */
    added?: boolean;
  }[];
  tracks: Track[];
  fontCss: string;
  samples: MediaItem[];
  scenes: { id: string; label: string; group: string; hiddenByDefault?: boolean }[];
  /** False without Apple's on-device helper, such as on Linux. */
  sorting: boolean;
  voice: {
    ready: boolean;
    voices: { id: string; name: string }[];
    defaultVoice: string;
    size: string;
  };
  /** Whether this browser is on the Mac running U-Cut, which is the only place connections change. */
  local: boolean;
  /** What U-Cut downloads once: the exporter, and captions and the voice when asked. */
  setup: SetupPart[];
  /** What writes, reads aloud and listens for this person. */
  uses: Uses;
}

export type SetupId = "browser" | "speech" | "voice";

export interface SetupPart {
  id: SetupId;
  name: string;
  purpose: string;
  bytes: number;
  required: boolean;
  ready: boolean;
  state: "idle" | "working" | "waiting" | "failed";
  done: number;
  step?: string;
  error?: string;
}

export interface Uses {
  write: "rules" | "claude";
  voice: "kokoro" | "voicestudio" | "elevenlabs" | "deepgram";
  listen: "whisper" | "voicestudio" | "deepgram" | "elevenlabs" | "openai";
}

export type Task = keyof Uses;

export interface Service {
  id: "claude" | "elevenlabs" | "deepgram" | "openai" | "voicestudio";
  name: string;
  tasks: Task[];
  local: boolean;
  needsKey: boolean;
  keyUrl?: string;
  sends: Partial<Record<Task, string>>;
  connected: boolean;
  keyEnding: string | null;
}

export interface Connections {
  local: boolean;
  services: Service[];
  choices: Uses;
  voiceStudio: { installed: boolean; running: boolean; allowed: boolean } | null;
  /** The full path to `ucut`, for assistants that don't read the shell's PATH. */
  launcher?: string;
}

export interface VoiceList {
  service: string;
  ready: boolean;
  voices: { id: string; name: string; detail?: string }[];
  error?: string;
}

/** What an assistant asked to change, through the link someone gave it. */
export interface AssistantChange {
  lines?: string[];
  title?: string;
  vibe?: Vibe;
  duration?: number;
  aspect?: "9:16" | "1:1" | "16:9";
  seed?: number;
}

export interface Job {
  id: string;
  createdAt: string;
  items: MediaItem[];
  plan: EditPlan | null;
  excludedScenes: string[];
  recipe: StyleRecipe | null;
  demo: Demo | null;
  script: Script | null;
}

export interface RenderEvent {
  type: "render";
  id: string;
  job: string;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  stage?: string;
  position?: number;
  etaSeconds?: number;
  url?: string;
  cached?: boolean;
  error?: string;
}

export interface MediaEvent {
  type: "media";
  job: string;
  id: string;
  state: "ready" | "failed";
  reason?: string;
  item?: MediaItem;
}

export interface RecordingEvent {
  type: "recording";
  job: string;
  id: string;
  state: "ready" | "failed";
  reason?: string;
  demo?: Demo;
}

export interface VoicingEvent {
  type: "voicing";
  job: string;
  done: number;
  total: number;
}

export interface AssistantEvent {
  type: "assistant";
  job: string;
  id: string;
  change: AssistantChange;
}

export type ServerEvent = RenderEvent | MediaEvent | RecordingEvent | VoicingEvent | AssistantEvent;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init).catch(() => {
    throw new Error("U-Cut stopped responding. Check that it's still running, then try again.");
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Something went wrong. Try that again.");
  return body;
}

const json = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  catalog: () => request<Catalog>("/api/catalog"),
  createJob: () => request<Job>("/api/jobs", { method: "POST" }),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  addSamples: (id: string) => request<Job>(`/api/jobs/${id}/samples`, { method: "POST" }),
  upload: (id: string, file: File) =>
    request<MediaItem>(`/api/jobs/${id}/media/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      body: file,
    }),
  uploadRecording: (id: string, file: File) =>
    request<MediaItem>(`/api/jobs/${id}/recording/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      body: file,
    }),
  uploadLogo: (id: string, file: File) =>
    request<MediaItem>(`/api/jobs/${id}/logo/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      body: file,
    }),
  saveScript: (id: string, script: Script) =>
    request(`/api/jobs/${id}/script`, { method: "PUT", ...json(script) }),
  speak: (id: string, lines: { text: string; speed: number }[], voice: string) =>
    request<{ lines: { src: string; length: number }[] }>(`/api/jobs/${id}/speak`, {
      method: "POST",
      ...json({ lines, voice }),
    }),
  setup: () => request<{ parts: SetupPart[]; local: boolean }>("/api/setup"),
  updateTemplates: () =>
    request<{ added: string[]; updated: string[]; skipped: { id: string; reason: string }[] }>(
      "/api/templates/update",
      { method: "POST" },
    ),
  startSetup: (id: SetupId) => request<SetupPart>(`/api/setup/${id}`, { method: "POST" }),
  stopSetup: (id: SetupId) => request<SetupPart>(`/api/setup/${id}/stop`, { method: "POST" }),
  saveDemo: (id: string, demo: Demo) =>
    request(`/api/jobs/${id}/demo`, { method: "PUT", ...json(demo) }),
  savePlan: (id: string, plan: EditPlan) =>
    request(`/api/jobs/${id}/plan`, { method: "PUT", ...json(plan) }),
  setScene: (id: string, media: string, scene: string) =>
    request<MediaItem>(`/api/jobs/${id}/media/${media}/scene`, {
      method: "PUT",
      ...json({ scene }),
    }),
  studyReel: (id: string, file: File) =>
    request<{ recipe: StyleRecipe; description: string }>(
      `/api/jobs/${id}/reference/${encodeURIComponent(file.name)}`,
      { method: "PUT", body: file },
    ),
  forgetReel: (id: string) => request(`/api/jobs/${id}/reference`, { method: "DELETE" }),
  setExcluded: (id: string, excluded: string[]) =>
    request(`/api/jobs/${id}/scenes`, { method: "PUT", ...json({ excluded }) }),
  exportReel: (id: string, name: string) =>
    request<RenderEvent>(`/api/jobs/${id}/export`, { method: "POST", ...json({ name }) }),
  cancelRender: (id: string) => request(`/api/renders/${id}`, { method: "DELETE" }),
  connections: () => request<Connections>("/api/connections"),
  connect: (service: string, key: string) =>
    request<Connections>(`/api/connections/${service}/key`, { method: "PUT", ...json({ key }) }),
  disconnect: (service: string) =>
    request<Connections>(`/api/connections/${service}`, { method: "DELETE" }),
  choose: (choices: Partial<Uses>) =>
    request<Connections>("/api/connections/choices", { method: "PUT", ...json(choices) }),
  allowVoiceStudio: (allowed: boolean) =>
    request<Connections>("/api/connections/voicestudio", { method: "PUT", ...json({ allowed }) }),
  openVoiceStudio: () => request("/api/connections/voicestudio/open", { method: "POST" }),
  voices: () => request<VoiceList>("/api/voices"),
  writeWithClaude: (
    id: string,
    body: { prompt: string; scenes: string[]; vibe: Vibe; duration: number },
  ) =>
    request<{ lines: Script["lines"] }>(`/api/jobs/${id}/write`, { method: "POST", ...json(body) }),
  answerAssistant: (job: string, change: string, outcome: { applied: boolean; error?: string }) =>
    request(`/api/jobs/${job}/assistant-changes/${change}`, { method: "POST", ...json(outcome) }),
  assistantLink: (id: string) =>
    request<{ link: string }>(`/api/jobs/${id}/assistant`, { method: "POST" }),
};

export function connectEvents(onEvent: (event: ServerEvent) => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (message) => onEvent(JSON.parse(message.data as string) as ServerEvent);
  return () => source.close();
}

export const mediaUrl = (item: MediaItem) =>
  `/media/${item.id}/${item.kind === "photo" ? "display" : "preview"}`;
export const screenUrl = (item: MediaItem) =>
  item.kind === "photo" ? mediaUrl(item) : `/media/${item.id}/screen`;
export const thumbUrl = (id: string) => `/media/${id}/thumb`;
