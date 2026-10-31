export type ServerEvent =
  | { type: "media"; job: string; id: string; state: "ready" | "failed"; reason?: string }
  | {
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
    };

type Send = (event: ServerEvent) => void;

/** Keeps each session's open event streams. Progress is thinned so slow links don't back up. */
export class EventHub {
  private readonly sessions = new Map<string, Set<Send>>();
  private readonly lastProgress = new Map<string, number>();
  private readonly intervalMs: number;

  constructor(intervalMs = 200) {
    this.intervalMs = intervalMs;
  }

  subscribe(session: string, send: Send): () => void {
    const senders = this.sessions.get(session) ?? new Set<Send>();
    senders.add(send);
    this.sessions.set(session, senders);
    return () => {
      senders.delete(send);
      if (senders.size === 0) this.sessions.delete(session);
    };
  }

  publish(session: string, event: ServerEvent) {
    if (event.type === "render" && event.state === "running") {
      const now = Date.now();
      if (now - (this.lastProgress.get(event.id) ?? 0) < this.intervalMs) return;
      this.lastProgress.set(event.id, now);
    }
    for (const send of this.sessions.get(session) ?? []) send(event);
  }

  get connections(): number {
    let total = 0;
    for (const senders of this.sessions.values()) total += senders.size;
    return total;
  }
}
