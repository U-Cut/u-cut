# 0004. How FFmpeg reaches users

Status: accepted, and built in Phase 7. The app carries the LGPL build rather than downloading it, see [0024](0024-the-app-carries-its-own-tools.md).

## Context

The brief forbids a GPL-only FFmpeg inside the app. Common prebuilt macOS binaries, including Homebrew's, are GPL because they enable x264 and x265. An LGPL build has no libx264, so HyperFrames' default H.264 path is unavailable.

`hyperframes render --gpu` encodes through VideoToolbox. In our test it produced H.264 High at the same wall-clock speed as x264, used about half the CPU, and scored SSIM 0.997 against the x264 render.

## Decision

- CI builds an LGPL FFmpeg and ffprobe (`--disable-gpl`, VideoToolbox and AudioToolbox on) and publishes the binaries, configure flags and source link as a release asset.
- First-run setup downloads that asset with a checksum into `~/Library/Application Support/U-Cut/`.
- Reels render with `--gpu`.
- Contributors and CLI users may use any FFmpeg on their `PATH`. `ucut doctor` reports which kind it found.

## Consequences

Before Phase 3 closes, confirm that HyperFrames never requires libx264 in its other paths, such as proxy transcodes. If it does, the fallback is to pre-transcode media ourselves with VideoToolbox during ingest.

## What happened

Built in Phase 7 as `scripts/build-ffmpeg.sh`: FFmpeg 9.0.2 with zimg 3.0.6, VideoToolbox and AudioToolbox, linked statically to nothing outside macOS. HyperFrames did need care in two places:

- It checks the hardware encoder with a generated test clip, which needs FFmpeg's `lavfi` input. That input is kept, and every other capture device is left out.
- Proxies for HDR footage need `zscale` and `tonemap`, which zimg provides.

With these, every integration test passes without libx264. Test fixtures encode with VideoToolbox on a Mac for the same reason.
