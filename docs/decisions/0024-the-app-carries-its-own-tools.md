# 0024. The app carries its own tools, and downloads only the browser

Status: accepted

## Context

The brief's first-run target is a clean Mac with only the app downloaded: no Homebrew, no Node, no Terminal. Until Phase 7, the Mac app was a window onto an engine installed by `install.sh`, which needed Homebrew for Node, FFmpeg, whisper-cpp and uv.

The engine needs these to make a reel:

- Node.
- FFmpeg and ffprobe.
- HyperFrames' rendering browser (Chrome for Testing's headless shell, 93 MB, pinned by HyperFrames 0.8.223).
- whisper-cli for captions, and the voice's Python for written reels. Both are optional.

[ADR 0004](0004-ffmpeg-distribution.md) rules out a GPL FFmpeg inside the app. A build without libx264 must still encode H.264 and tone-map iPhone HDR video.

## Decision

- **The app carries what it can.** `scripts/package-mac.sh` puts these in `U-Cut.app/Contents/Resources/runtime`:
  - Node 24 from nodejs.org, checked against its published SHA-256.
  - The engine, with only its production packages (`pnpm deploy --prod`), laid out like the repository.
  - An LGPL FFmpeg 9.0.2 with zimg (`scripts/build-ffmpeg.sh`), whisper-cli 1.9.5 (`scripts/build-whisper.sh`) and `ucut-vision`.
  - All four programs link only macOS's own libraries, and `scripts/check-package.sh` fails the release if one doesn't.
- **On first launch, and after each update, it copies `runtime` into `~/Library/Application Support/U-Cut/runtime/<version>-<build>`.**
  - It removes the download's quarantine flag from the copy, because the person already approved the app by opening it.
  - It runs the engine from there. On APFS the copy is a clone, so it takes a few seconds and little disk.
  - It also writes `~/Library/Application Support/U-Cut/bin/ucut`, which always points at the current version, for assistants.
- **The engine finds the bundled tools by itself.** A `runtime.json` beside the engine marks an app install. Before anything else runs, `useBundledTools()` puts `runtime/bin` first on the PATH and sets `HYPERFRAMES_FFMPEG_PATH`, `HYPERFRAMES_FFPROBE_PATH`, `HYPERFRAMES_WHISPER_PATH` and `UCUT_VISION`. So the app, the `ucut` launcher and assistants all use the same tools.
- **The only download is the browser, and U-Cut does it itself.**
  - The file is the exact one HyperFrames pins, checked against a SHA-256 recorded when it was added. Its MD5 matched the one Google's server reports.
  - It downloads in a `.part` file. A dropped connection is retried with back-off, carrying on with an HTTP range request.
  - Starting again after quitting also carries on.
  - The interface shows a first-run screen with the size and progress. You can look around while it finishes.
- **Captions and the voice download only when asked, the same way.** The speech model uses HyperFrames' own pinned checksum. The Kokoro model files are checked against pinned checksums too. uv comes from its GitHub release, also checked. The voice's Python and its two packages are pinned by version, and uv fetches them without a checksum from us.
- **Signing:**
  - Without an Apple Developer account, the app is signed ad hoc, and people approve it once in System Settings.
  - With an account, the same script signs every program inside with the hardened runtime, and the release workflow notarizes and staples the disk image.
  - Node gets the JIT and library-validation entitlements it needs.
- **Releases.** Pushing a `v*` tag runs `.github/workflows/release.yml`:
  - It builds the app and runs `scripts/check-package.sh --download` on a clean environment.
  - It publishes the `.dmg`, its checksum and FFmpeg's exact source tarball (for the LGPL), with notes from `CHANGELOG.md`.

## Consequences

- The disk image is about 135 MB, and the app about 330 MB on disk. That's mostly Node and FFmpeg.
- A clean Mac makes its first reel after one 93 MB download, and needs no Terminal.
- People who install with `install.sh` keep using Homebrew's tools. Both paths run the same engine.
- HyperFrames updates now need the browser pin in `setup/parts.ts` moved with them. A test of the pinned file runs in the release workflow.
- Unsigned builds depend on macOS letting an approved app run its own copied tools. This was tested by quarantining every tool inside the app and launching it: the copies came out without the flag, and the engine started from them. Gatekeeper's own approval screen wasn't part of that test. A real download, opened through System Settings, is still the final check.
- The FFmpeg build has no libx264, so U-Cut always encodes with VideoToolbox. All 21 integration tests pass with only the bundled tools, including rotated 10-bit HLG HEVC from an iPhone, which comes out as SDR H.264.
