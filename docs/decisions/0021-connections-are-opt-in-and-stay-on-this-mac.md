# 0021. Connections to other services are opt-in, and their keys stay on this Mac

Status: accepted

## Context

The owner wants people to be able to bring the services they already pay for or run: Claude for writing, ElevenLabs and Deepgram for voices and listening, OpenAI's Whisper for listening, and Voice Studio for free local voices. The brief's non-negotiables still hold: the default lanes make no network calls, a person's media never leaves the Mac unless they turn on a lane that sends it, and the interface says so.

## Decision

A **connection** is one service U-Cut can use for one or more jobs:

| Job    | Built in, and the default | Connections                                |
| ------ | ------------------------- | ------------------------------------------ |
| Write  | Rules, in the browser     | Claude, with the person's API key          |
| Voice  | Kokoro, on this Mac       | Voice Studio, ElevenLabs, Deepgram         |
| Listen | Whisper, on this Mac      | Voice Studio, Deepgram, ElevenLabs, OpenAI |

- **Nothing is used until someone chooses it.** Connecting a key doesn't switch anything on; choosing it for a job does. A key in an environment variable is never picked up by itself.
- **Every choice says what leaves the Mac,** in one sentence, before it's made: "Your script's words go to ElevenLabs to be read aloud." Voice Studio runs on this Mac, so nothing leaves it.
- **Keys live in the macOS Keychain** (service `U-Cut`, one account per service), written and read with `security`. On Linux and in Docker they live in `connections.json` in U-Cut's data folder, readable only by its owner. Keys are never sent to a browser: the app sees whether a service is connected and the last four characters.
- **Only the person at this Mac can change connections or use paid ones.** "At this Mac" now means the request's socket comes from a loopback address. The old check trusted the `Host` header, which anyone on the network can set, so `--lan` guests could have passed for local. Guests on the network always get the built-in lanes.
- **A service does only the job it was chosen for.** A Deepgram key connected for listening can't be used to read aloud, even by an assistant, so nobody spends credits they didn't mean to.
- **In Docker,** no request comes from loopback, so the image sets `UCUT_SINGLE_USER=1`: whoever can reach the container is its owner. The README publishes the port on `127.0.0.1` only, for that reason.
- **A failure falls back, and says so.** If Claude is unreachable, the rules write the script. If a cloud voice fails, U-Cut says which line and why, and the built-in voice is one press away. A reel is never lost to a connection.
- **The Claude lane uses Anthropic's official TypeScript SDK** with structured output, on `claude-opus-5-5` at low effort, which is plenty for twelve short lines. It runs on the server, beside the key. Its answer is checked against the same `ScriptLine` schema and word limits as the rules lane before it's used.
- **Providers are plain HTTP clients** with an injectable `fetch`, so tests run without a network and without keys. Each has a cheap check that runs when a key is added, so a typo fails at once rather than mid-reel.
- **Speech made by a service is cached like Kokoro's,** by service, voice, speed and words, so changing one line re-reads only that line and nothing is paid for twice.

The privacy test still blocks the network and makes every kind of reel, so the default lanes stay offline by test, not by promise.

## Consequences

People can use better voices and listening without U-Cut taking a cut or holding their keys. U-Cut takes on the risk of each service changing its API, so each client is small, typed and tested against recorded response shapes. Keys in the Keychain need the Mac's login keychain to be unlocked, which it is whenever someone is logged in.
