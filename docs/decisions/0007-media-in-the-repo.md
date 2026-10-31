# 0007. What media lives in the repo

Status: accepted

## Context

The owner's working rule is that video files never go in a code repo. The brief also forbids media without licence metadata. CI still needs fixture media for golden renders, and Phase 1 needs CC0 music in `library/music`.

## Decision

- No video files in git. `.gitignore` excludes them and `scripts/license-scan.ts` fails on any that slip in.
- Fixture media is generated at test time with FFmpeg's `lavfi` sources, so tests can also produce HDR, rotated and HEIC inputs on demand.
- Golden renders are stored as small frame-hash JSON files, not video.
- Preview GIFs are the one rendered output in the repo, kept under 2 MB as the brief says.
- Starter music is first-party. `scripts/make-music.ts` synthesises one track per vibe, and we dedicate them to CC0. The generator is in the repo, so the provenance can be checked.
- Real CC0 tracks can replace them through the asset-submission template, with licence proof.

## Consequences

Synthesised tracks prove the pipeline but are not great music. Better tracks are a good first contribution, and we will say so in `CONTRIBUTING.md`.
