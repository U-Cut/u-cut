# 0023. Voice Studio is used when it's installed, only after asking

Status: accepted

## Context

[Voice Studio](https://github.com/debpalash/VoiceStudio) is a free desktop app for voice cloning, voice design and transcription. It runs its models locally. It serves an OpenAI-compatible API on `localhost:3900` with `/v1/audio/speech`, `/v1/audio/transcriptions`, `/v1/audio/voices` and `/v1/models`, and it answers local clients without a key. The owner wants U-Cut to notice it and use it, after asking.

Voice Studio is AGPL-3.0, and U-Cut is Apache-2.0.

## Decision

- **U-Cut never bundles, copies or installs Voice Studio.** It talks to Voice Studio's local API only when it's already running on this Mac. Talking to a separate program over HTTP doesn't make U-Cut a derivative of it.
- **Detection is passive.** The Connections sheet checks for the app at `/Applications/VoiceStudio.app` and asks `localhost:3900/v1/models` with a one-second timeout. Nothing is sent until the person presses **Use Voice Studio**, and that choice is remembered in `connections.json`. It can be turned off in the same place.
- **When it's installed but not running,** the sheet offers **Open Voice Studio**, which runs `open -a VoiceStudio` for the person at this Mac only.
- **What it's used for:** voices, from its voice list and any voices someone has cloned or designed, and listening, with the product name sent as a hint so names like "Claude" come out right.
- **It's local,** so choosing it changes nothing about what leaves the Mac.
- **Errors say what to do:** "Voice Studio isn't answering. Open it and try again."

## Consequences

People with Voice Studio get its voices, including their own cloned voice, for free, and better listening. If its API changes, only `voicestudio.ts` needs updating. U-Cut is tested against recorded responses, and by hand against a running copy when one is available.
