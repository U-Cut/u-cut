# U-Cut: build brief for Claude Code

> **Name:** U-Cut (repo `u-cut`, command-line tool `ucut`).
> **Owner:** Mayank Narayan. This is a side project, separate from any other video work.
> **Audience:** Claude Code, working in this repo. Read the whole file before writing code, then follow §12.

---

## 1. What we're building

U-Cut is an **open-source Mac app** plus a **community library of video templates**. It turns whatever a beginner already has into a finished vertical reel, rendered as an MP4 on their own Mac. There is no editing timeline and no learning curve.

A user can drop in any of these:

| Input | What the app does |
| --- | --- |
| **A pile of photos and clips** from their phone | Sorts them into scenes (cafés, mountains, home, flights, railway stations, metros…) and groups them into moments (a trip, a day). Picks the best shots and cuts a reel to music. |
| **A reel they admire**, saved from their phone | Studies its structure: length, cut rhythm, beat grid, text style and placement, transitions, colour and sections. It then rebuilds that *structure* with the user's own media. It never reuses the reference's footage or audio. |
| **A screen recording** | Makes an app or product demo: picks the key moments, adds push-in zooms, captions from the speech, and a title and end card. |
| **Plain English**, for example "a 20-second reel about my Goa trip, chill vibe" | Writes a short script, voices it locally, and builds the reel from their media or from text and graphics. |

The output is an MP4 (1080×1920 by default, with 1:1 and 16:9 as options) and an editable project folder, so advanced users can open and tweak it.

Distribution: users download a `.dmg` from **GitHub Releases**. Contributors add templates, effects, sound and code through pull requests.

## 2. Non-negotiables

1. **Local-first.** Analysis, classification, voice, effects, rendering and mixing all run on the user's Mac. No paid services and no per-render fees. User media never leaves the Mac unless the user turns on an AI lane that sends data (see §4), and the UI says so.
2. **Beginner-first.** The flow is drop, pick a vibe (or "match this reel"), preview, export. Every automatic decision can be corrected in one gesture, such as dragging a photo to another bucket or swapping a shot, without a timeline.
3. **Deterministic renders.** The same inputs and plan always produce the same video.
4. **Licences are clean.**
   - Code is Apache-2.0.
   - Every bundled asset (font, sound, music, image, model) carries licence metadata and is CC0, CC-BY, OFL, Apache-2.0 or MIT.
   - Don't re-host third-party asset libraries in this repo. Pull them through their own packages at install time.
   - Reference reels are used for **structure only**.
5. **Claude usage follows Anthropic's rules** (see §4).

## 3. The open-source stack

| Job | Tool | Licence / notes |
| --- | --- | --- |
| Video composition and rendering | **HyperFrames** by HeyGen: HTML compositions rendered to MP4 by seeking frames in headless Chrome (Puppeteer) and encoding with FFmpeg. Includes a CLI, a Studio editor, a player, a registry of about 450 blocks, and Claude Code skills. | Apache-2.0. Needs Node 22+ and FFmpeg. Renders locally. No HeyGen account is needed for any of this; HeyGen's paid services (avatars and so on) are out of scope. |
| Encoding, probing, loudness | FFmpeg / ffprobe | Ship an LGPL build, or install it on first run. Never a GPL-only build inside the app. |
| Voiceover | Kokoro TTS (kokoro-onnx), also reachable through `npx hyperframes tts` | Apache-2.0. Offline. |
| Speech to text (captions, screen recordings) | whisper.cpp | MIT. Offline. Ship a small model and offer bigger ones as downloads. |
| Shot detection | FFmpeg scene filter, or PySceneDetect | BSD-3 |
| Beat and tempo detection | `npx hyperframes beats`, or librosa / aubio | Check each licence. |
| Scene classification | Apple **Vision** on-device classifier (`ClassifyImageRequest`, macOS 15+) for broad labels, plus a zero-shot **SigLIP or OpenCLIP** model (Core ML or ONNX) for U-Cut's own categories | Confirm the weights' licence before bundling. Prefer Apache-2.0 or MIT. |
| Faces, text in frames (OCR), saliency for smart crops | Apple Vision | Built into macOS. |
| Music | 1) The user's own track. 2) A bundled CC0 music pack. 3) An optional local generator add-on: ACE-Step (reported Apache-2.0 and able to run on Apple Silicon; confirm the model card before shipping). | Never "in the style of" a named artist. |
| Sound effects | A CC0 pack in this repo, plus HyperFrames' bundled library fetched through its package | Store attribution in each asset's metadata. |

## 4. Claude: what it does here, and the rules

Claude is the **planner**. It writes hooks and captions, orders the story, turns a reference-reel analysis into a style recipe, and fills template variables. The engine does everything else deterministically.

**Rule (Anthropic, Agent SDK docs):**

> "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."

So the app must **not** log in with a user's Claude subscription or run their subscription in the background on their behalf. Build three planner lanes behind one `Planner` interface:

| Lane | How it works | Cost to the user |
| --- | --- | --- |
| **Rules (default)** | A deterministic planner. Templates define sections, shot counts and pacing. Shots are chosen by category, quality and beat grid; captions come from template copy and EXIF (place, date). | Free |
| **Claude Code plugin** | The repo ships a Claude Code plugin with skills, commands and the `ucut` CLI. Users who have Claude Code run it **themselves**, in their own terminal or VS Code. The app can prepare a job folder and offer "Open this job in Claude Code", with a ready prompt for the user to paste. The app never drives `claude` for them. | Their own Claude plan, used by them in Claude Code |
| **API key (opt-in)** | The user pastes their own Anthropic API key, stored in the macOS Keychain. The app calls the API for planning only. Before the first call, the UI shows what data is sent (thumbnails, transcripts, the analysis JSON). | Pay-as-you-go API usage |

If the owner later wants in-app subscription login, that needs Anthropic's approval first. Track it as an open question (§13). Don't build it.

Branding: don't call the product or any feature "Claude Code", and don't mimic Claude Code's visuals. "Powered by Claude" is fine where Claude is actually used.

## 5. User flows and their outputs

### A. Photo and clip dump → auto-sorted reel
1. **Ingest.** Accept drag-and-drop of files or folders, or use the Photos picker.
   - Copy the media into a job folder, or use security-scoped bookmarks.
   - Read EXIF and QuickTime metadata: time, GPS and orientation.
2. **Quality pass** on every item:
   - Blur (Laplacian variance), exposure and noise.
   - Near-duplicates (perceptual hash).
   - Faces and smiles, and saliency for crop centres.
3. **Classify** each photo, and each clip from 1 frame per second with a majority vote over shots:
   - Combine Vision labels with SigLIP zero-shot scores against prompt sets per category, e.g. "a photo of a café interior", "a latte on a café table".
   - Store the top-3 labels with confidence.
   - Anything below the confidence threshold goes to **"Other"**.
4. **Group into moments.** Start a new moment after a time gap of more than 45 minutes or a jump of more than 2 km. Reverse geocoding (an online Apple service) is opt-in. Offline, show the date only.
5. **Sort view.** Show buckets as grids. Users can drag to fix a label; a correction updates the label in the job and is saved as a local few-shot example for next time.
6. **Pick a story template** (travel montage, café crawl, day-in-my-life, city walk, weekend recap…) and a **vibe** (chill, hype, cinematic, nostalgic). The vibe sets music energy, cut speed and grade.
7. **Auto edit.**
   - The rules planner fills each template section from the right buckets.
   - Cuts land on the beat grid.
   - Photos get gentle push-ins or pans centred on saliency.
   - Clips are trimmed to their best-scoring window.
8. **Preview, then export.** Preview runs in HyperFrames Studio or Player inside a WKWebView, or as a low-res draft render. Export renders at full quality and masters to −14 LUFS.

**Starter taxonomy** (contributors can extend it through `classifiers/taxonomy.yaml`):
- **Places:** café, restaurant, food close-up, home interior, bedroom/cosy, office/desk, gym, mountains, hills/trek, beach, lake/river, forest, desert, snow, city street, night city, market, temple/heritage, museum.
- **Transport:** flight (cabin, wing, airport), railway station, train interior, metro/subway, road trip/car, bike.
- **People:** selfie, group, pets.
- **Other:** sky/sunset, concert/event, screenshots and documents (excluded by default).

### B. "Make mine like this" (reference reel)
1. **Analyse** the reference (it never ships in the output):
   - Duration and aspect.
   - Shot boundaries, giving a shot-length histogram and cut rhythm.
   - Beat grid and BPM, and how cuts align to beats.
   - On-screen text through Vision OCR: font size, position, case, timing per word or line.
   - Transition types (hard cut, whip, zoom, fade), estimated from frame differences.
   - Colour (average palette, contrast, saturation) and structure (hook, body, payoff, by energy and text density).
2. **Write a `StyleRecipe` JSON** (schema in §7) and show it as a plain-English card. For example: "Fast hook, 0.4 s cuts on every beat, bold white captions centred low, warm grade, ends on a slow-motion shot."
3. **Apply the recipe** to the user's media with the matching template, or with the generic "recipe" template.
   - Music: choose a licensed or generated track with similar BPM and energy.
   - Captions: the user's own words. Never transcribe and reuse the reference's text or audio.

### C. Screen recording → demo
1. Transcribe the recording with whisper.cpp.
2. Find the action moments: cursor and click bursts, UI change scores, and speech emphasis.
3. Propose picks (clip, in/out points, why), then let the user confirm or skip them.
4. Build the demo:
   - Camera: establish the screen, push in 1.6–2× on the action, hold, then pull back.
   - Captions from the transcript.
   - A title and an end card made from a simple brand form (name, colour, logo).

### D. Plain English → reel
1. Prompt → script (3–8 words per line) → Kokoro voice (one call per line, each with its own speed).
2. Kinetic captions, plus either the user's media chosen by the planner or template graphics.
3. Stock footage is **off** by default. It's an optional plug-in for users who add their own key, e.g. Pexels.

## 6. Architecture

```
┌─────────── Mac app (SwiftUI, macOS 15+, Apple Silicon) ──────────────┐
│ Drop zone · Sort view · Template/vibe picker · Preview (WKWebView)   │
│ Export · Settings (planner lane, API key in Keychain, models)        │
│ Swift helper `ucut-vision`: Vision + Core ML (classify, faces,       │
│   OCR, saliency) → JSON on stdout                                    │
└───────────────┬──────────────────────────────────────────────────────┘
                │ spawns the CLI and streams JSON progress events
┌───────────────▼──────── Engine: `ucut` CLI (Node 22, TypeScript) ────┐
│ ingest → analyze → classify → plan → compose → render → master       │
│   analyze: ffprobe, scene cuts, beats, quality scores, transcripts   │
│   plan:    Planner interface (rules | api)                           │
│   compose: template + EditPlan → HyperFrames project                 │
│   render:  `hyperframes render` → FFmpeg loudnorm master             │
│ Python sidecar (managed with `uv`): Kokoro TTS, optional ACE-Step    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Job folder**, the single source of truth (`~/Movies/U-Cut/jobs/<id>/`):
  - `inputs/` (copies or bookmarks)
  - `analysis/*.json`
  - `plan.json`
  - `project/` (a HyperFrames project)
  - `renders/`
  - `log.jsonl`
- **The CLI works without the app**, e.g. `ucut make ./photos --template travel-montage --vibe chill -o out.mp4`. This is what CI, contributors and the Claude Code plugin use.
- **First-run setup** installs into `~/Library/Application Support/U-Cut/`, with a progress screen, a size estimate, resume support and checksums:
  - A bundled Node runtime.
  - FFmpeg.
  - Chrome headless shell (through the HyperFrames/Puppeteer installer).
  - A `uv` Python environment.
  - Models: Kokoro, Whisper small, SigLIP. ACE-Step is optional.
- **Concurrency:** one render at a time; analysis runs in parallel; jobs can be cancelled.
- **Logs:** structured logs, plus a "Copy diagnostics" button for bug reports. No telemetry by default.

## 7. Core schemas (TypeScript in `packages/schema`, mirrored as Swift `Codable`)

- `MediaItem`: `{ id, path, kind: photo|video, w, h, duration?, takenAt?, gps?, orientation, quality: {sharpness, exposure, faces, dupGroup}, labels: [{id, score}], moment }`
- `StyleRecipe`: `{ aspect, duration, bpm?, cutRhythm: {median, p90, onBeat: bool}, sections: [{name, start, end, energy}], text: {font, sizePx, position, case, timing}, transitions: [...], grade: {temp, contrast, sat}, notes }`
- `EditPlan`: `{ template, vibe, duration, music: {src, bpm, start}, voice?: [...], shots: [{media, in, out, start, end, motion: {type, from, to}, crop}], texts: [{text, start, end, style}], transitions: [...], sfx: [{src, at, vol}] }`
- `TemplateManifest`: `{ id, name, version, author, licence, aspects, durationRange, sections: [{name, slots: [{accepts: [labels], count, minDur, maxDur}]}], variables: [...], vibes: [...], preview: gif, requires: [blocks] }`

Validate every JSON with zod. Show schema errors as plain sentences.

## 8. Templates and the community library (the "in-house" part)

Each template is a folder:

```
templates/<id>/
  template.json      TemplateManifest
  index.html         HyperFrames root composition (slots and variables as data-var-*)
  compositions/      one scene per file
  preview.gif        under 2 MB, rendered by CI
  README.md          what it's for, slot rules, credits
```

- **Template rules:**
  - Follow the HyperFrames contract: `npx hyperframes check` must pass.
  - No network fetches at render time.
  - Seeded randomness only.
  - Copy and colours are variables.
  - Bundled media must have licence metadata in `assets.json`.
- **Starter pack (v1):** travel montage, café crawl, day-in-my-life, city/metro walk, weekend recap, app demo, plain-text explainer, and "recipe" (driven entirely by a StyleRecipe).
- **Library folders:**
  - `library/sfx` (CC0)
  - `library/music` (CC0)
  - `library/fonts` (OFL)
  - `library/luts` (CC0)
  - `library/blocks`: our own HyperFrames blocks; registry blocks are added with `npx hyperframes add`, not copied.
- **Registry:** CI builds `registry/index.json`, listing templates and blocks with previews. The app reads it to show the template gallery and can update it without an app release.

## 9. Repo layout and governance

```
u-cut/
  apps/mac/                SwiftUI app + ucut-vision helper (Xcode project, SPM)
  packages/engine/         ucut CLI (TypeScript)
  packages/schema/         zod schemas + generated Swift types
  packages/planner-rules/  deterministic planner
  packages/planner-api/    Anthropic API planner (opt-in)
  plugin/                  Claude Code plugin: skills, commands, README
  classifiers/             taxonomy.yaml, prompt sets, eval set manifest, model download manifest
  templates/               community templates (see §8)
  library/                 sfx, music, fonts, luts, blocks (CC0/OFL only)
  registry/                generated index.json
  scripts/                 setup, model fetch, golden renders
  docs/                    user guide, contributor guide, ADRs (docs/decisions/NNNN-*.md)
  .github/                 workflows, issue and PR templates, CODEOWNERS
  LICENSE (Apache-2.0) · NOTICE · CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md
```

- **Contributions:**
  - DCO sign-off on every commit.
  - Issue templates for: bug, template request, new template, asset submission (licence proof required), and classifier category.
  - A PR checklist: tests pass, `hyperframes check` passes, licence metadata present, preview GIF attached.
- **CI** (GitHub Actions on macOS runners):
  - Lint and typecheck.
  - Unit tests.
  - Schema tests.
  - `hyperframes check` on every template.
  - A **golden render** of each template at 360p from fixture media, with a frame-diff tolerance.
  - The classifier eval on a small labelled fixture set.
  - A licence scan of dependencies and assets.
- **Releases:**
  - Tag → GitHub Actions builds the app and produces a `.dmg` → GitHub Releases, with a changelog.
  - Notarization needs an Apple Developer account (paid yearly). Without it, the docs explain how to open an unsigned app.
  - A Homebrew cask comes later.

## 10. Quality bars (acceptance targets)

| Area | Target |
| --- | --- |
| Classifier | ≥ 85% top-1 on the 10 core categories (café, mountains, home, flight, railway station, metro, beach, city street, food, night city), measured on a labelled eval set of at least 300 items in `classifiers/eval`. "Other" is used rather than guessing when confidence is low. |
| Speed (M1, 16 GB) | Classify 500 photos in ≤ 2 min. A 30 s 1080×1920 draft in ≤ 60 s; final render ≤ 3 min. |
| First run | Setup completes on a clean Mac with only the app downloaded. It resumes after a network drop. |
| Output | 1080×1920, 30 fps, H.264 + AAC, −14 LUFS, true peak ≤ −1 dBTP. Captions stay inside the 80% title-safe area. |
| Reliability | The same job produces a byte-identical plan and a visually identical render. |
| Privacy | Zero network calls during analysis, planning and rendering in the default lanes, enforced by a test that runs the pipeline with networking blocked. |

## 11. Non-goals for v1

- Windows or Linux apps. The CLI may still work there.
- Cloud rendering.
- Avatars.
- Posting to social networks.
- Downloading reels from Instagram, Pinterest or other sites. Users bring their own files.
- Stock-footage scraping.
- Face recognition of named people. Grouping by "same face" is a later, opt-in feature.

## 12. How Claude Code should work on this

1. **Start with a plan.** Read this file and write `docs/PLAN.md` with the phases below broken into tasks, and any questions. Ask the owner only what blocks you; otherwise choose sensible defaults and record them as ADRs in `docs/decisions/`.
2. **Build in phases.** Stop at the end of each phase and give a short demo note (the commands to run, and what to look at).
   - **Phase 0 – Scaffold:**
     - Monorepo (pnpm workspaces), Xcode project, licence files, CONTRIBUTING, issue and PR templates.
     - CI skeleton.
     - The schema package.
   - **Phase 1 – Engine MVP, no AI:** `ucut make <folder> --template travel-montage` produces an MP4 from photos and clips using the rules planner, beat-synced cuts, and CC0 music from `library/music`. Golden render in CI.
   - **Phase 2 – Classification:**
     - The `ucut-vision` helper (Vision + SigLIP), plus the taxonomy and prompt sets.
     - The quality pass, moments, and the eval script with its report.
   - **Phase 3 – Mac app MVP:** drop zone, first-run setup, sort view with drag-to-fix, template and vibe picker, preview, export, job history.
   - **Phase 4 – Reference reels:** analyser → StyleRecipe → "recipe" template → apply to the user's media.
   - **Phase 5 – Screen recordings and plain English:** whisper.cpp captions, Kokoro voice, the demo and explainer templates.
   - **Phase 6 – Planner lanes:**
     - The Claude Code plugin: skills that drive the `ucut` CLI on a job folder.
     - The API-key planner with its data-disclosure screen.
     - Both behind the `Planner` interface, with the rules lane as the fallback.
   - **Phase 7 – Ship:** `.dmg` build, release workflow, user guide, contributor guide, and 8 starter templates with previews.
3. **Engineering rules.**
   - TypeScript strict mode. Swift 6 with strict concurrency.
   - Small modules with unit tests.
   - Never commit media without licence metadata.
   - Never add a dependency with a non-permissive licence without asking.
   - No network calls in default lanes.
   - Prefer the HyperFrames CLI and skills (`npx hyperframes skills`) over hand-rolled rendering, and search the HyperFrames registry before hand-building an effect.
4. **Done means:** tests pass, `hyperframes check` passes on templates, a fresh-clone setup works by following README steps alone, and the phase's acceptance targets in §10 are met or the gap is written down.

## 13. Open questions for the owner

1. GitHub org or user for the `u-cut` repo.
2. Minimum macOS version. Recommended: macOS 15 on Apple Silicon only, for the on-device classifier and speed.
3. Notarization: will there be a paid Apple Developer account for signed releases?
4. In-app Claude subscription login: only if Anthropic approves it (§4). Until then, use the rules + Claude Code plugin + API-key lanes.
5. The starter template styles to prioritise first, and any brand look for the app itself.
