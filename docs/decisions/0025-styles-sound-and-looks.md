# 0025. Styles, sound effects and looks come from the library, and new styles can arrive later

Status: accepted

## Context

The brief asks for eight starter templates with previews, CC0 sound effects and colour looks in `library/`, vibe-driven grades and effects, and a registry that CI builds and the app reads, "so it can update without an app release".

Before Phase 7 there were six templates without previews. Plans had an `sfx` list that was always empty. Vibes already graded footage with a CSS filter.

## Decision

- **Two new styles, café crawl and day in my life, are more than new pacing.**
  - A template can ask for labels on its shots (`labels` in `template.json`).
  - With `"time"`, every shot of 0.8 s or more carries the clock time the photo was taken ("7:42 am").
  - With `"stops"`, a gap of 30 minutes or more between photos starts a new stop. Each stop's first shot is numbered ("Stop 1", "Stop 2"), and a day with only one stop gets no numbers.
  - Time stamps follow their photo when shots are swapped or replaced.
  - The time is read on the Mac making the reel, which is where the photos' times were read, so it matches the camera's clock.
- **Sound effects are U-Cut's own, synthesised by `scripts/make-sfx.ts`, so they're CC0.** There are six: whoosh, hit, riser, swell, shutter and pop.
  - Each vibe places a few at the reel's turning points: the first beat, the end of the hook, and into the closing shot.
  - Stop labels get a soft pop.
  - Each effect in a plan records its `length`, which the render needs, and plans can only use the library's files.
  - The preview plays them in time, so the reel sounds the same before and after export.
  - They can be switched off in the app, with `--no-sfx`, or by an assistant saving a plan with none.
- **Looks stay as CSS filters, and the LUTs are generated from them.**
  - The render and the browser preview must match, and a CSS filter does in both.
  - `scripts/make-luts.ts` turns each vibe's exact filter into a 17-point `.cube` file, using the Filter Effects matrices. People can then carry the look into Resolve, Premiere or FFmpeg.
  - Compared with Chrome's own rendering of the same filter, each LUT scores 50 to 63 dB PSNR, which is no visible difference.
- **Previews are rendered by `scripts/make-previews.ts` and committed, under 2 MB each.** CI checks they exist and fit, rather than rendering them on every push. Rendering them takes about 80 seconds, and the result would change the files' bytes each time.
- **The registry is `registry/index.json`, built by `scripts/build-registry.ts`.**
  - It lists every template with its summary, preview and the SHA-256 of each file, and every library asset with its licence.
  - `pnpm check` fails when it's out of date.
  - The app's style gallery reads it, and shows the photo styles with their previews.
- **New styles can arrive without a new app, only when asked.**
  - `ucut templates update`, or **Get new styles** in the gallery, fetches the registry from GitHub.
  - It adds photo styles that are new, or newer than the installed ones, into `~/Movies/U-Cut/templates`.
  - Every file must match its checksum. The manifest must validate in this version of U-Cut.
  - The CSS may not use `url(`, `@import` or anything that runs code, so a shared style can't make a preview fetch from the network.
  - The other styles depend on code in the app, so only photo styles arrive this way.

## Consequences

- The default lanes still make no network calls. The registry is fetched only when someone asks for new styles.
- Older plans still load, since they never had sound effects. The `length` field is required from now on.
- Synthesised effects are a start. Recorded CC0 effects would sound more natural, and are a good first contribution.
- The previews use the painted sample photos, so they show each style's pacing and type rather than real trips.
