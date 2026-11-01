# 0019. Written reels are planned by rules first, and timed by the voice

Status: accepted

## Context

The brief asks U-Cut to turn a sentence such as "a 20-second reel about my Goa trip, chill vibe" into a script of 3 to 8 words a line, voice it locally with Kokoro, one call per line at its own speed, and build the reel from someone's media or from text and graphics. It also says no AI credits and no network in the default lane, so the default can't call a language model.

## Decision

`readPrompt` reads the length, vibe, shape and subject from the sentence. `writeScript` then writes the script from fixed patterns for each kind of reel and vibe, and fills them with the subject and the scenes found in someone's photos. A line about the beach is written because there's a beach photo, and that photo goes under that line. If someone pastes more than a sentence or two, or puts words in quotes, U-Cut sets out their words instead of writing its own.

These are plain functions, so they run in the browser and every edit is instant. The Claude Code and API lanes in Phase 6 can replace `writeScript` without changing anything after it.

`planScript` builds the reel around the words. Each voiced line has a measured length, and that sets the timing, so words, voice and pictures stay together. Until a line is voiced, its length is estimated, so the reel appears straight away and the voice follows. Spare time goes into the pauses to reach the length asked for, up to 1.5 seconds a pause.

Words land one at a time, each as its own timed element, which keeps the preview and the render identical. With no media, each line gets its own moving colour from the vibe's palette.

### The voice

`ucut setup --voice`, or Add a voice in the app, installs Kokoro into its own Python with `uv`, at `~/.cache/u-cut/voice`, and fetches the model. That's about 500 MB, and it only happens when someone asks, as [ADR 0009](0009-licence-exceptions.md) requires, because `espeak-ng` is GPL. It stays in that separate process and never ships in the app. The path has to stay short, because espeak fails on long data paths.

Every line is cached by its words, voice and speed, so changing one line re-reads only that line. Without the voice, a written reel is words and music.

### Stock footage

It stays off. The plug-in point is the `items` list given to `planScript`: anything that downloads clips with a person's own key can add them with `ingest`, and the planner treats them like their own media. Nothing in U-Cut does this.

## Consequences

- The built-in writer is a starting point, not a writer. It knows nothing about a topic, so a reel about "how sleep works" gets general lines. Better scripts need the Phase 6 lanes, or someone's own words.
- It never repeats a line, so a long reel with few scenes tops out at about nine lines, then stretches its pauses. A 60-second request can come out well short of a minute.
- Lines are in English. Kokoro has other languages, but the writer doesn't.
- Word timing is shared out by letter count, not measured from the voice, so words can land slightly ahead or behind.
