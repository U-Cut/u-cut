# 0005. Analysis goes through the HyperFrames CLI

Status: accepted

## Context

The brief lists several tools for analysis and asks us to prefer the HyperFrames CLI. Its table says to check the licences of the beat-detection options. aubio is GPL-3.0, so it can't be used.

The CLI covers more than the brief assumed:

| Need                          | Command                                 | Tested                                               |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------- |
| Beats and BPM of one file     | `audio <file> --only beats,bpm --json`  | Yes. Found a 120 BPM grid, confidence 0.978, offline |
| Sections of a track           | `audio <file> --only sections --json`   | Not yet                                              |
| Cuts in a reference reel      | `measure cuts`                          | Not yet                                              |
| On-screen events              | `measure events --map`                  | Not yet                                              |
| Reference colour and contrast | `measure look`                          | Not yet                                              |
| Speech to text                | `transcribe` (whisper)                  | Not yet                                              |
| Voice                         | `tts` (Kokoro)                          | Not yet                                              |
| HEIC photos                   | Converted automatically by the compiler | Yes                                                  |
| HEVC clips                    | Auto-proxied                            | Yes                                                  |

`audio` may use a macOS 27 Music Understanding engine when available. That is local, but its results may differ between macOS versions.

## Decision

- Don't add aubio, librosa or PySceneDetect. `measure` and `audio` replace them.
- Never pass `--quality best` to `audio`. It uploads audio to HeyGen and may bill the user.
- `beats` fails when a track has no steady beat. The engine then falls back to an even grid derived from the template's pacing.
- The Python sidecar is built only if a feature can't be served by the CLI. Today that means optional ACE-Step music.
- Beat grids are cached in the job folder, so re-planning a job can't change when macOS does.

## Consequences

Phase 4 starts with a short evaluation of `measure` on real reels. Vision OCR for on-screen text is still ours, in `ucut-vision`.
