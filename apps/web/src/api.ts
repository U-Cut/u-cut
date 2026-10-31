import type { BeatGrid, EditPlan, MediaItem, TemplateManifest, Vibe } from "@u-cut/schema";

export interface Track {
  file: string;
  vibe: Vibe;
  bpm: number;
  length: number;
  beats: BeatGrid;
}

export interface Catalog {
  templates: { manifest: TemplateManifest; css: string }[];
  tracks: Track[];
  fontCss: string;
  samples: MediaItem[];
}

export interface Job {
  id: string;
  createdAt: string;
  items: MediaItem[];
  plan: EditPlan | null;
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
}

export type ServerEvent = RenderEvent | MediaEvent;

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
  savePlan: (id: string, plan: EditPlan) =>
    request(`/api/jobs/${id}/plan`, { method: "PUT", ...json(plan) }),
  exportReel: (id: string, name: string) =>
    request<RenderEvent>(`/api/jobs/${id}/export`, { method: "POST", ...json({ name }) }),
  cancelRender: (id: string) => request(`/api/renders/${id}`, { method: "DELETE" }),
};

export function connectEvents(onEvent: (event: ServerEvent) => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (message) => onEvent(JSON.parse(message.data as string) as ServerEvent);
  return () => source.close();
}

export const mediaUrl = (item: MediaItem) =>
  `/media/${item.id}/${item.kind === "photo" ? "display" : "preview"}`;
export const thumbUrl = (id: string) => `/media/${id}/thumb`;
