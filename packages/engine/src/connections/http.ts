/** A service U-Cut calls, and how it answered. Every message is a plain sentence for the person. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export type Fetch = typeof fetch;

export interface CallOptions extends RequestInit {
  timeoutMs?: number;
  /** Said when the service can't be reached at all. */
  unreachable?: string;
}

/** One request to a service, with a time limit and errors people can act on. */
export async function call(
  service: string,
  url: string,
  options: CallOptions,
  fetchImpl: Fetch = fetch,
): Promise<Response> {
  const { timeoutMs = 60_000, unreachable, signal, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const stop = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", stop, { once: true });
  let response: Response;
  try {
    const answered = await fetchImpl(url, { ...init, signal: controller.signal });
    // A service can send its headers and then stall, so the whole body is read before the timer stops.
    const body = await answered.arrayBuffer();
    response = new Response(body, { status: answered.status, headers: answered.headers });
  } catch {
    if (signal?.aborted) throw new Error("Cancelled");
    if (controller.signal.aborted) throw new ServiceError(`${service} didn't answer in time.`);
    throw new ServiceError(
      unreachable ?? `U-Cut couldn't reach ${service}. Check your internet connection.`,
      undefined,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (response.ok) return response;
  const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
  if (
    /quota|credit|insufficient|payment/i.test(detail) &&
    [401, 402, 403, 429].includes(response.status)
  ) {
    throw new ServiceError(
      `${service} says you've run out of credits. Top up your plan, or choose another service.`,
      response.status,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ServiceError(
      `${service} didn't accept the key. Check it and connect again.`,
      response.status,
    );
  }
  if (response.status === 429) {
    throw new ServiceError(
      `${service} says you've reached your limit. Wait a minute, or check your plan.`,
      429,
    );
  }
  throw new ServiceError(
    `${service} couldn't do that (${response.status}).${detail ? ` It said: ${detail}` : ""}`,
    response.status,
  );
}

export async function json<T>(response: Response, service: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ServiceError(`${service} sent back something U-Cut couldn't read.`);
  }
}

export async function bytes(response: Response, service: string): Promise<Uint8Array> {
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength < 100) throw new ServiceError(`${service} sent back no sound.`);
  return data;
}
