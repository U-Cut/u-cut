# 0018. Demos are cut from speech first, then screen changes

Status: accepted

## Context

The brief asks U-Cut to turn a screen recording into a demo: find the key moments, let the person confirm them, then add push-in zooms, captions, and title and end cards. It names three signals: cursor and click bursts, screen changes, and speech emphasis. Everything has to run on the person's own computer with nothing downloaded mid-job.

## Decision

`ucut demo` and the app share one pipeline:

1. `hyperframes transcribe` (whisper.cpp, `small.en`, `--no-runtime-install`) gives timed words. `hyperframes measure events` gives screen changes on a 4×4 grid. Both results are stored with the file, so a recording is only read once.
2. `findMoments` makes one moment per spoken sentence. A recording with no speech falls back to bursts of screen change, and one with neither offers the whole recording.
3. The cells that changed during a moment give the push-in target and its size, from 1.6× to 2×. If more than half the screen changed, the camera stays wide.
4. The person keeps or skips each moment and can correct its words. `planDemo` runs in the browser, so every change is instant, like the rest of the editor.

The recording is shown whole (`fit: contain`) and keeps its own sound (`keepAudio`). Music drops to 12% under speech. The app previews a 1600-pixel copy with sound, because the usual 540-pixel preview can't show small text once the camera pushes in. Renders use PNG frames for the same reason.

The speech model is 465 MB, so it's fetched by `ucut setup --speech`, which the installer runs. Without it, a demo still works, with no captions, and the app says how to add them.

## Consequences

- Cursor and click bursts and speech emphasis aren't used yet. Any screen change counts, so something animating by itself can pull the camera away from the button being pressed.
- Whisper makes mistakes, such as hearing "hype vibe" as "high five". That's why each moment's words can be corrected.
- Corrected words are spread evenly across the moment, so they can drift slightly from the voice.
- A wide recording in a tall reel is small until the camera pushes in. A demo starts in the recording's own shape for that reason.
