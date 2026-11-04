import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { checkClaudeKey } from "@u-cut/planner-api";
import type { DemoWord } from "@u-cut/schema";
import { homeDir } from "../paths.ts";
import { checkDeepgram, deepgramListen, deepgramSpeak, deepgramVoices } from "./deepgram.ts";
import {
  checkElevenLabs,
  elevenLabsListen,
  elevenLabsModel,
  elevenLabsSpeak,
  elevenLabsVoices,
} from "./elevenlabs.ts";
import { checkOpenAi, openAiListen } from "./openai.ts";
import { checkKeyShape, secrets } from "./secrets.ts";
import type { Choices, Heard, ServiceId, Spoken, Task, Voice } from "./types.ts";
import {
  voiceStudioListen,
  voiceStudioSpeak,
  voiceStudioState,
  voiceStudioVoices,
} from "./voicestudio.ts";

export { ServiceError } from "./http.ts";
export type { Choices, ServiceId, Task, Voice } from "./types.ts";
export { openVoiceStudio, voiceStudioState } from "./voicestudio.ts";

export interface ServiceInfo {
  id: ServiceId;
  name: string;
  tasks: Task[];
  /** Runs on this Mac, so choosing it sends nothing anywhere. */
  local: boolean;
  needsKey: boolean;
  /** Where to make a key. */
  keyUrl?: string;
  /** One sentence per task saying what leaves the Mac. */
  sends: Partial<Record<Task, string>>;
}

export const services: ServiceInfo[] = [
  {
    id: "claude",
    name: "Claude",
    tasks: ["write"],
    local: false,
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    sends: {
      write:
        "Your sentence and the names of your photos' scenes go to Anthropic to write the script. Your photos don't.",
    },
  },
  {
    id: "voicestudio",
    name: "Voice Studio",
    tasks: ["voice", "listen"],
    local: true,
    needsKey: false,
    sends: {
      voice: "Voice Studio runs on this computer, so nothing leaves it.",
      listen: "Voice Studio runs on this computer, so nothing leaves it.",
    },
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    tasks: ["voice", "listen"],
    local: false,
    needsKey: true,
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    sends: {
      voice: "Your script's words go to ElevenLabs to be read aloud.",
      listen: "Your recording's sound goes to ElevenLabs to be written down.",
    },
  },
  {
    id: "deepgram",
    name: "Deepgram",
    tasks: ["voice", "listen"],
    local: false,
    needsKey: true,
    keyUrl: "https://console.deepgram.com/",
    sends: {
      voice: "Your script's words go to Deepgram to be read aloud.",
      listen: "Your recording's sound goes to Deepgram to be written down.",
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    tasks: ["listen"],
    local: false,
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    sends: { listen: "Your recording's sound goes to OpenAI to be written down." },
  },
];

export const builtIn: Choices = { write: "rules", voice: "kokoro", listen: "whisper" };

const choicesFor: Record<Task, string[]> = {
  write: ["rules", "claude"],
  voice: ["kokoro", "voicestudio", "elevenlabs", "deepgram"],
  listen: ["whisper", "voicestudio", "deepgram", "elevenlabs", "openai"],
};

export const serviceInfo = (id: string) => services.find((service) => service.id === id);

interface Saved {
  choices: Choices;
  voiceStudio: { allowed: boolean };
}

const settingsPath = () => join(homeDir(), "connections.json");

async function load(): Promise<Saved> {
  const text = await readFile(settingsPath(), "utf8").catch(() => "{}");
  let saved: Partial<Saved> = {};
  try {
    saved = JSON.parse(text) as Partial<Saved>;
  } catch {
    // A damaged file means the built-in lanes, which is always safe.
  }
  const choices = { ...builtIn, ...saved.choices };
  for (const task of Object.keys(builtIn) as Task[]) {
    if (!choicesFor[task].includes(choices[task]))
      (choices as Record<Task, string>)[task] = builtIn[task];
  }
  return { choices, voiceStudio: { allowed: saved.voiceStudio?.allowed === true } };
}

async function save(saved: Saved): Promise<void> {
  await mkdir(dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), `${JSON.stringify(saved, null, 2)}\n`);
}

export async function keyFor(id: ServiceId): Promise<string | null> {
  return serviceInfo(id)?.needsKey ? secrets().get(id) : null;
}

/** Whether a service can be chosen now: it has a key, or Voice Studio has been allowed. */
async function usable(id: ServiceId, saved: Saved): Promise<boolean> {
  if (id === "voicestudio") return saved.voiceStudio.allowed;
  return (await keyFor(id)) !== null;
}

/** What each task uses. A choice whose key has gone falls back to the built-in lane. */
export async function currentChoices(): Promise<Choices> {
  const saved = await load();
  const choices = { ...saved.choices };
  for (const task of Object.keys(builtIn) as Task[]) {
    const choice = choices[task];
    const service = serviceInfo(choice);
    if (service && !(await usable(service.id, saved))) {
      (choices as Record<Task, string>)[task] = builtIn[task];
    }
  }
  return choices;
}

export interface ServiceStatus extends ServiceInfo {
  connected: boolean;
  /** The last four characters, so people can tell which key it is. */
  keyEnding: string | null;
}

export interface ConnectionsStatus {
  services: ServiceStatus[];
  choices: Choices;
  voiceStudio: { installed: boolean; running: boolean; allowed: boolean };
  /** The full path to `ucut`, because assistants start servers without the shell's PATH. */
  launcher: string;
}

export function launcherPath(): string {
  if (process.env.UCUT_LAUNCHER) return process.env.UCUT_LAUNCHER;
  const installed = join(homedir(), ".local/bin/ucut");
  return existsSync(installed) ? installed : "ucut";
}

export async function connectionsStatus(): Promise<ConnectionsStatus> {
  const saved = await load();
  const listed = await Promise.all(
    services.map(async (service): Promise<ServiceStatus> => {
      const key = await keyFor(service.id);
      return {
        ...service,
        connected: service.id === "voicestudio" ? saved.voiceStudio.allowed : key !== null,
        keyEnding: key ? key.slice(-4) : null,
      };
    }),
  );
  const state = await voiceStudioState();
  return {
    services: listed,
    choices: await currentChoices(),
    voiceStudio: { ...state, allowed: saved.voiceStudio.allowed },
    launcher: launcherPath(),
  };
}

const checks: Partial<Record<ServiceId, (key: string) => Promise<void>>> = {
  claude: (key) => checkClaudeKey(key),
  elevenlabs: (key) => checkElevenLabs(key),
  deepgram: (key) => checkDeepgram(key),
  openai: (key) => checkOpenAi(key),
};

/** Checks a key with the service, then keeps it. Nothing starts using it until it's chosen. */
export async function connect(id: ServiceId, key: string): Promise<void> {
  const check = checks[id];
  if (!check) throw new Error("That service doesn't use a key.");
  // A paste that can't be a key is caught here, before anything is sent anywhere.
  const shaped = checkKeyShape(key);
  await check(shaped);
  await secrets().set(id, shaped);
  voiceCache.delete(id);
}

export async function disconnect(id: ServiceId): Promise<void> {
  const saved = await load();
  if (id === "voicestudio") saved.voiceStudio.allowed = false;
  else await secrets().remove(id);
  voiceCache.delete(id);
  for (const task of Object.keys(builtIn) as Task[]) {
    if (saved.choices[task] === id) (saved.choices as Record<Task, string>)[task] = builtIn[task];
  }
  await save(saved);
}

export async function allowVoiceStudio(allowed: boolean): Promise<void> {
  const saved = await load();
  saved.voiceStudio.allowed = allowed;
  if (!allowed) {
    for (const task of Object.keys(builtIn) as Task[]) {
      if (saved.choices[task] === "voicestudio") {
        (saved.choices as Record<Task, string>)[task] = builtIn[task];
      }
    }
  }
  await save(saved);
}

export async function choose(task: Task, choice: string): Promise<Choices> {
  if (!choicesFor[task]?.includes(choice)) {
    const jobs = { write: "write scripts", voice: "read aloud", listen: "listen" };
    throw new Error(
      `U-Cut can't use "${choice}" to ${jobs[task] ?? task}. It can use: ${(choicesFor[task] ?? []).join(", ")}.`,
    );
  }
  const saved = await load();
  const service = serviceInfo(choice);
  if (service && !(await usable(service.id, saved))) {
    throw new Error(
      service.id === "voicestudio"
        ? "Let U-Cut use Voice Studio first."
        : `Connect ${service.name} first.`,
    );
  }
  (saved.choices as Record<Task, string>)[task] = choice;
  await save(saved);
  return currentChoices();
}

/** A voice is written `service:id`. Kokoro's voices have no prefix, as they always have. */
export function splitVoice(voice: string): { service: string; id: string } {
  const at = voice.indexOf(":");
  return at === -1
    ? { service: "kokoro", id: voice }
    : { service: voice.slice(0, at), id: voice.slice(at + 1) };
}

async function needKey(id: ServiceId): Promise<string> {
  const key = await keyFor(id);
  if (!key) throw new Error(`Connect ${serviceInfo(id)?.name ?? id} first.`);
  return key;
}

const voiceCache = new Map<string, { at: number; voices: Voice[] }>();

export async function voicesOf(id: ServiceId): Promise<Voice[]> {
  const cached = voiceCache.get(id);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.voices;
  let voices: Voice[];
  if (id === "elevenlabs") voices = await elevenLabsVoices(await needKey(id));
  else if (id === "deepgram") voices = deepgramVoices;
  else if (id === "voicestudio") voices = await voiceStudioVoices();
  else throw new Error("That service doesn't read aloud.");
  voiceCache.set(id, { at: Date.now(), voices });
  return voices;
}

/** Which model a service's voices come from, so a change of model never reuses old speech. */
export function voiceModel(service: string): string {
  return service === "elevenlabs" ? elevenLabsModel : service;
}

/** A paid service is only ever used for the job someone chose it for. */
async function mustBeChosen(task: Task, service: string): Promise<void> {
  if ((await currentChoices())[task] === service) return;
  const named = serviceInfo(service)?.name ?? service;
  if (!choicesFor[task].includes(service)) {
    throw new Error(
      `${named} can't ${task === "voice" ? "read aloud" : "listen"}. U-Cut can use: ${choicesFor[task].join(", ")}.`,
    );
  }
  throw new Error(
    task === "voice"
      ? `${named} isn't chosen to read aloud. Choose it in Connections, or with \`ucut connections --voice ${service}\`.`
      : `${named} isn't chosen to listen. Choose it in Connections, or with \`ucut connections --listen ${service}\`.`,
  );
}

/** The voice to use when nobody named one: the chosen service's first, or Kokoro's default. */
export async function defaultVoiceFor(choices: Choices): Promise<string> {
  if (choices.voice === "kokoro") return "af_heart";
  if (choices.voice === "deepgram") return "deepgram:aura-2-thalia-en";
  if (choices.voice === "voicestudio") return "voicestudio:default";
  const [first] = await voicesOf("elevenlabs");
  if (!first) throw new Error("ElevenLabs has no voices on this account yet.");
  return `elevenlabs:${first.id}`;
}

export async function speakWith(
  service: string,
  input: { voice: string; text: string; speed: number; signal?: AbortSignal },
): Promise<Spoken> {
  await mustBeChosen("voice", service);
  if (service === "elevenlabs") return elevenLabsSpeak(await needKey("elevenlabs"), input);
  if (service === "deepgram") return deepgramSpeak(await needKey("deepgram"), input);
  if (service === "voicestudio") {
    if (!(await load()).voiceStudio.allowed) throw new Error("Let U-Cut use Voice Studio first.");
    return voiceStudioSpeak(input);
  }
  throw new Error("That isn't a voice U-Cut can use.");
}

export async function listenWith(service: string, input: Heard): Promise<DemoWord[]> {
  await mustBeChosen("listen", service);
  if (service === "deepgram") return deepgramListen(await needKey("deepgram"), input);
  if (service === "elevenlabs") return elevenLabsListen(await needKey("elevenlabs"), input);
  if (service === "openai") return openAiListen(await needKey("openai"), input);
  if (service === "voicestudio") {
    if (!(await load()).voiceStudio.allowed) throw new Error("Let U-Cut use Voice Studio first.");
    return voiceStudioListen(input);
  }
  throw new Error("That isn't a way of listening U-Cut can use.");
}
