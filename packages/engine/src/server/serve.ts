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

function lanAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return undefined;
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
