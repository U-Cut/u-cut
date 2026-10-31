import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { serve as listen } from "@hono/node-server";
import { createApp } from "./app.ts";

export interface ServeOptions {
  port: number;
  /** Lets other devices on the network use this Mac. Off by default. */
  lan: boolean;
  /** Listens on every interface. For containers, whose port is published deliberately. */
  bindAll?: boolean;
}

/** Wi-Fi and Ethernet addresses first. Tethering and VPNs can list odd ones ahead of them. */
function lanAddress(): string | undefined {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => ({ name, ip: address.address })),
  );
  const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const rank = (candidate: { name: string; ip: string }) =>
    (isPrivate(candidate.ip) ? 0 : 2) + (candidate.name.startsWith("en") ? 0 : 1);
  return candidates.sort((a, b) => rank(a) - rank(b))[0]?.ip;
}

export async function serve(options: ServeOptions): Promise<{ url: string; lanUrl?: string }> {
  const lanIp = options.lan ? lanAddress() : undefined;
  const accessCode = lanIp ? randomBytes(4).toString("hex") : undefined;
  const hosts = lanIp ? [`${lanIp}:${options.port}`] : [];
  const { app, prepareSamples } = createApp({ hosts, ...(accessCode ? { accessCode } : {}) });
  void prepareSamples().catch(() => {
    // The sample reel is a nicety. Everything else works without it.
  });

  await new Promise<void>((resolve, reject) => {
    const server = listen(
      {
        fetch: app.fetch,
        port: options.port,
        hostname: lanIp || options.bindAll ? "0.0.0.0" : "127.0.0.1",
      },
      () => resolve(),
    );
    server.on("error", reject);
  });

  return {
    url: `http://localhost:${options.port}`,
    ...(lanIp ? { lanUrl: `http://${lanIp}:${options.port}/?code=${accessCode}` } : {}),
  };
}
