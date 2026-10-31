# 0001. HyperFrames is pinned, local and forced offline

Status: accepted

## Context

The brief makes HyperFrames the renderer and requires zero network calls in the default lanes. Out of the box the CLI does not meet that bar. Version 0.8.223 has telemetry on by default (PostHog), checks npm for updates, auto-installs optional tools, can fetch fonts from Google Fonts, scaffolds projects that load GSAP from jsDelivr, and offers commands that upload (`publish`, `cloud`, `feedback --file-issue`, `audio --quality best`, `transcribe --engine heygen`).

We rendered an 8 s reel under a `sandbox-exec` profile that denies all outbound IP traffic except localhost. It completed, so offline rendering is possible.

## Decision

- `hyperframes` is an exact-version dependency of `packages/engine`. Never `npx hyperframes`, which resolves over the network.
- All calls go through one wrapper, `packages/engine/src/hf.ts`, which:
  - Sets `HYPERFRAMES_NO_TELEMETRY=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, `HYPERFRAMES_NO_AUTO_INSTALL=1`, `HYPERFRAMES_NO_OPTIONAL_INSTALL=1` and `DO_NOT_TRACK=1`.
  - Allows only a fixed list of subcommands: `audio`, `beats`, `check`, `doctor`, `lint`, `measure`, `render`, `snapshot`, `transcribe`, `tts`.
  - Rejects `--quality best` and `--engine heygen`.
- Renders always pass `--sdr` and `--no-best-effort`.
  - Without `--sdr`, one HDR clip silently turned the whole reel into 10-bit HEVC HLG, which breaks the H.264 target.
  - `--no-best-effort` fails on media that did not load, instead of shipping a broken frame.
- Fonts come from `library/fonts` through `@font-face` to a project file, so the compiler has nothing to fetch.
- The engine captures CLI output. HyperFrames' promotional lines never reach U-Cut users.

## Consequences

Upgrading HyperFrames is a deliberate PR that re-runs golden renders. The privacy test in Phase 1 enforces all of this rather than trusting it.
