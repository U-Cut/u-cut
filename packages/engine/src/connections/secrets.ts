import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { homeDir } from "../paths.ts";

/** Where API keys live: the Keychain on a Mac, a file only its owner can read everywhere else. */
export interface Secrets {
  get(account: string): Promise<string | null>;
  set(account: string, value: string): Promise<void>;
  remove(account: string): Promise<void>;
}

const service = "U-Cut";

/** Keys go to `security` on standard input, so they never appear in the list of running programs. */
function security(args: string[], input?: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", args, { stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
    child.stdin.end(input ?? "");
  });
}

/** Keys are pasted, so anything that isn't a plain run of visible characters is a mistake. */
export function checkKeyShape(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,400}$/.test(key)) {
    throw new Error("That doesn't look like an API key. Copy it again and paste only the key.");
  }
  return key;
}

const keychain: Secrets = {
  async get(account) {
    const { code, stdout } = await security([
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ]);
    return code === 0 ? stdout.trim() || null : null;
  },
  async set(account, value) {
    const key = checkKeyShape(value);
    const { code } = await security(
      ["-i"],
      `add-generic-password -U -s "${service}" -a "${account}" -w "${key}"\n`,
    );
    if (code !== 0) throw new Error("The Keychain didn't save the key. Unlock it and try again.");
  },
  async remove(account) {
    await security(["delete-generic-password", "-s", service, "-a", account]);
  },
};

/** One change at a time, so two saves can never interleave. */
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

function fileSecrets(path: () => string): Secrets {
  const read = async (): Promise<Record<string, string>> => {
    const text = await readFile(path(), "utf8").catch(() => "{}");
    try {
      return JSON.parse(text) as Record<string, string>;
    } catch {
      // A damaged file costs the keys in it, never the app.
      return {};
    }
  };
  const save = async (all: Record<string, string>) => {
    await mkdir(dirname(path()), { recursive: true });
    const partial = `${path()}.${process.pid}.partial`;
    await writeFile(partial, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
    await chmod(partial, 0o600);
    await rename(partial, path());
  };
  return {
    async get(account) {
      return (await read())[account] ?? null;
    },
    set(account, value) {
      const key = checkKeyShape(value);
      return inTurn(async () => save({ ...(await read()), [account]: key }));
    },
    remove(account) {
      return inTurn(async () => {
        const { [account]: _gone, ...rest } = await read();
        await save(rest);
      });
    },
  };
}

/** Set UCUT_SECRETS=file to keep keys in a file on a Mac too, as the tests do. */
export function secrets(): Secrets {
  if (platform() === "darwin" && process.env.UCUT_SECRETS !== "file") return keychain;
  return fileSecrets(() => join(homeDir(), "connection-keys.json"));
}
