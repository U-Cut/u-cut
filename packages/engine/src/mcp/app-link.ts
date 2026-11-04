// Talks to the U-Cut app running on this Mac, for the reel someone handed to their assistant.

export interface AppChange {
  lines?: string[] | undefined;
  title?: string | undefined;
  vibe?: string | undefined;
  duration?: number | undefined;
  aspect?: string | undefined;
  seed?: number | undefined;
}

/** The link is only ever followed to this Mac, whatever it says. */
export function readLink(link: string): { origin: string; token: string } {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error(
      'That isn\'t a U-Cut link. Copy it again from "Give this reel to your assistant".',
    );
  }
  const token = /^\/assistant\/([a-f0-9]{48})\/?$/.exec(url.pathname)?.[1];
  if (!token || !["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol !== "http:") {
    throw new Error(
      'That isn\'t a U-Cut link. Copy it again from "Give this reel to your assistant".',
    );
  }
  return { origin: `http://127.0.0.1:${url.port || "80"}`, token };
}

async function ask(link: string, path: string, init?: RequestInit): Promise<unknown> {
  const { origin, token } = readLink(link);
  let response: Response;
  try {
    response = await fetch(`${origin}/api/assistant/${token}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("U-Cut isn't open. Open it, then copy the link again.");
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "U-Cut didn't accept that. Copy the link again from the app.");
  }
  return body;
}

export const appReel = (link: string) => ask(link, "");

export const appChange = (link: string, change: AppChange) =>
  ask(link, "/change", { method: "POST", body: JSON.stringify(change) });
