# U-Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, open-source Mac app and `ucut` CLI that turn photos and clips, a reference reel, a screen recording or plain English into a finished vertical MP4, entirely on the user's Mac.

**Architecture:** A TypeScript engine runs a fixed pipeline (`ingest → analyze → classify → plan → compose → render → master`) around a job folder. A swappable `Planner` writes `plan.json`, compose turns it into a GSAP-free HyperFrames project, and HyperFrames renders it. A SwiftUI app and a Swift Vision helper sit on top, talking to the CLI over JSON.

**Tech Stack:** Node 22+, TypeScript strict, pnpm workspaces, zod, Vitest, Biome, HyperFrames 0.8.223, FFmpeg, Swift 6, SwiftUI, Vision, Core ML, whisper.cpp and Kokoro through HyperFrames.

**Spec:** [docs/BRIEF.md](BRIEF.md). Where this plan differs, [docs/decisions/](decisions/) records why.

## Status

Updated 2026-11-01.

| Phase                                  | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Scaffold                            | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1. Engine MVP, no AI                   | Done, except a golden render stored between commits. Repeat renders are compared in `pnpm test:int` instead. Not yet run on real phone media                                                                                                                                                                                                                                                                                                                                                                                          |
| 2. Classification                      | Done, but short of the 85% target: 65% on unseen places ([ADR 0016](decisions/0016-scenes-from-apple-vision.md)). The next step is to measure SigLIP on the same test                                                                                                                                                                                                                                                                                                                                                                 |
| 3. Mac app MVP                         | Partly done, and changed. One web interface runs in the browser and the Mac app ([ADR 0012](decisions/0012-one-interface-everywhere.md)), and the sort view is in. Still to do: job history, and a first-run setup that needs no Terminal                                                                                                                                                                                                                                                                                             |
| 4. Reference reels                     | Done, on generated reels ([ADR 0017](decisions/0017-reference-reels-keep-structure-only.md)). Still to do: test on real saved reels, and detect transitions beyond cuts and end fades                                                                                                                                                                                                                                                                                                                                                 |
| 5. Screen recordings and plain English | Done, with gaps. Demos ([ADR 0018](decisions/0018-demos-from-speech-and-screen-changes.md)) are tested on generated and narrated recordings, and cursor and click bursts and speech emphasis aren't done. Written reels ([ADR 0019](decisions/0019-written-reels-rules-first.md)) use a fixed-pattern writer until Phase 6                                                                                                                                                                                                            |
| 6. Planner lanes                       | Done, with gaps. Assistants connect through `ucut mcp` and the Claude Code plugin ([ADR 0022](decisions/0022-assistants-connect-through-mcp.md)), and can change the reel open in the app. Claude writes scripts with the person's own key, and ElevenLabs, Deepgram, OpenAI and Voice Studio can voice or listen ([ADR 0021](decisions/0021-connections-are-opt-in-and-stay-on-this-mac.md), [ADR 0023](decisions/0023-voice-studio-is-used-only-where-installed.md)). Not yet tried against live services or a running Voice Studio |
| 7. Ship                                | Partly done: three of eight templates, and an install script. No `.dmg` yet                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Added since the brief:** `ucut serve` with a fair export queue, `--lan` sharing, Docker, a 20-person load test ([ADR 0013](decisions/0013-browser-plans-server-exports.md)), and a website with a live reel ([ADR 0020](decisions/0020-the-website-is-static.md)).

## Global Constraints

- Local-first: zero network calls during analysis, planning and rendering in default lanes.
- Same inputs and plan give the same video: byte-identical `plan.json`, renders at SSIM ≥ 0.995 ([ADR 0006](decisions/0006-what-deterministic-means.md)).
- Code is Apache-2.0. Bundled assets are CC0, CC-BY, OFL, Apache-2.0 or MIT, each with licence metadata. No GSAP. No video files in git.
- Every commit carries a DCO sign-off.
- Output: 1080×1920 (1:1 and 16:9 as options), 30 fps, H.264 + AAC, −14 LUFS, true peak ≤ −1 dBTP, captions inside the 80% title-safe area.
- Every HyperFrames call goes through `hf.ts`, with offline switches on and `--sdr --no-best-effort` on renders ([ADR 0001](decisions/0001-hyperframes-pinned-and-offline.md)).
- The app never logs in with, or drives, a Claude subscription ([ADR 0008](decisions/0008-claude-subscription-stays-with-the-user.md)).
- macOS 15+, Apple Silicon. Node 22+. Swift 6 with strict concurrency. TypeScript strict mode.
- Errors shown to users are plain sentences.

## Review Focus

The inputs most likely to hurt a real user that the brief doesn't spell out, most likely first. Each has a test in the task that owns it.

1. **A pile from a real iPhone:** HDR clips, Live Photo pairs (`IMG_1.HEIC` + `IMG_1.MOV`), `.AAE` sidecars, `.DS_Store`, screenshots, names like `IMG_1234 (1).HEIC` or emoji folders. The reel still comes out as H.264 SDR, each moment appears once, and nothing crashes. (Task 1.2, Task 1.7)
2. **Too little or too much media:** one photo, three photos for a 30 s template, or one 40-minute video. The result is a shorter reel or a clear sentence, never a repeated-frame mess or a hang. (Task 1.4)
3. **Hindi or other non-Latin captions:** HyperFrames' bundled fonts are Latin only and we block the Google Fonts fallback. Devanagari text must render with real glyphs, not boxes. (Task 1.1, Task 1.5)
4. **A tight Mac:** 8 GB RAM with little free, under 20 GB disk. U-Cut lowers worker count, checks space first, and fails in plain words. (Task 1.2, Task 1.6)
5. **Music with no steady beat, or shorter than the reel:** `beats` fails on such a track. The engine falls back to an even grid, and short music loops or fades instead of cutting to silence. (Task 1.3)

## What we tested before planning

All run on the owner's Mac (A18 Pro, 8 GB, macOS 26.5) with throwaway projects.

| Question                                             | Result                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Can HyperFrames render with outbound network denied? | Yes, under `sandbox-exec`.                                                            |
| Does a composition work without GSAP?                | Yes. CSS keyframes pass `check` and render correctly.                                 |
| Do rotated HEVC and HEIC work?                       | Yes. Both handled by HyperFrames.                                                     |
| Does HDR survive?                                    | Only with `--sdr`. Without it the whole reel became 10-bit HEVC.                      |
| Is rendering deterministic?                          | 4 of 5 renders matched exactly. The fifth differed by an invisible amount in one pan. |
| Is it fast enough?                                   | 8 s reel: 12 s draft, 15 s `looks`. Synthetic media, so treat this as a best case.    |
| Does VideoToolbox work?                              | Yes, with SSIM 0.997 against x264 and half the CPU.                                   |
| Can we master to spec?                               | Yes. Two-pass `loudnorm` reached −14.0 LUFS and −1.0 dB.                              |
| Does beat detection work offline?                    | Yes. 120 BPM found, confidence 0.978.                                                 |
| Can Swift build without Xcode?                       | Yes for SwiftUI, WebKit and Vision. `swift test` does not work.                       |

## Where this plan departs from the brief

| Brief says                                  | Plan does                               | Why                                                                                      |
| ------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| HyperFrames blocks and GSAP-based templates | GSAP-free templates                     | Licence and network ([0002](decisions/0002-no-gsap-in-templates.md))                     |
| Xcode project                               | Swift package                           | No Xcode needed ([0003](decisions/0003-swiftpm-instead-of-xcode-project.md))             |
| Python sidecar for Kokoro                   | `hyperframes tts`                       | The CLI already does it ([0005](decisions/0005-analysis-through-hyperframes.md))         |
| librosa, aubio or PySceneDetect             | `hyperframes audio` and `measure`       | aubio is GPL; the CLI covers it ([0005](decisions/0005-analysis-through-hyperframes.md)) |
| Bundled CC0 music pack                      | First-party synthesised tracks to start | No video or unverified media in git ([0007](decisions/0007-media-in-the-repo.md))        |
| Copies or security-scoped bookmarks         | APFS clones                             | Saves disk ([0010](decisions/0010-job-inputs-are-apfs-clones.md))                        |
| Speed targets on M1, 16 GB                  | Also measured on 8 GB                   | Matches real users ([0011](decisions/0011-defaults-for-the-open-questions.md))           |

## Questions for the owner

Nothing blocks Phase 2.

1. By Phase 7: will there be a paid Apple Developer account for signed releases?

---

## Phase 0: Scaffold

### Task 0.1: Repo, governance and docs

**Files:** `LICENSE`, `NOTICE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.gitignore`, `.editorconfig`, `.nvmrc`, folder READMEs for `templates/`, `library/`, `plugin/`, `classifiers/` (with `taxonomy.yaml`), `registry/`.

**Interfaces:** Produces the `§9` layout that later tasks fill.

- [x] **Step 1:** Write the files. `CONTRIBUTING.md` covers DCO (`git commit -s`), setup, how to add a template, and "better CC0 music" as a good first contribution. `SECURITY.md` points to GitHub private vulnerability reporting. `classifiers/taxonomy.yaml` holds the brief's starter taxonomy, with the 10 core categories flagged.
- [x] **Step 2:** `.gitignore` excludes `*.mp4`, `*.mov`, `*.m4v`, `*.webm`, `node_modules`, `dist`, `.build`, `.hyperframes`.

### Task 0.2: Workspace, tooling and CLI stub

**Files:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `packages/engine/{package.json,tsconfig.json,src/cli.ts,src/cli.test.ts}`.

**Interfaces:** Produces the `ucut` bin. `ucut --version` prints the package version. Packages export `{"source": "./src/index.ts", "default": "./dist/index.js"}`, so tests and typecheck run from source.

- [x] **Step 1: Write the failing test:** `cli.test.ts` asserts `run(["--version"])` returns the version from `package.json`, and that an unknown command returns a plain-sentence error and exit code 1.
- [x] **Step 2:** Run `corepack pnpm test`. Expected: FAIL, `run` not defined.
- [x] **Step 3:** Implement `run(argv: string[]): Promise<{code: number; stdout: string; stderr: string}>` in `cli.ts`, with `citty`.
- [x] **Step 4:** Run `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint`. Expected: all pass.

### Task 0.3: Schema package

**Files:** `packages/schema/src/{media.ts,recipe.ts,plan.ts,template.ts,planner.ts,validate.ts,index.ts}`, with tests beside them; `packages/schema/fixtures/*.json`.

**Interfaces:**
- Produces `MediaItem`, `StyleRecipe`, `EditPlan`, `TemplateManifest` (zod schemas and inferred types, shaped as in §7).
- Produces `validate<T>(schema, data, label: string): {ok: true; value: T} | {ok: false; errors: string[]}`.
- Produces `interface Planner { readonly lane: "rules" | "plugin" | "api"; plan(input: PlannerInput): Promise<EditPlan> }`.

- [x] **Step 1: Write the failing tests:** each fixture parses. `EditPlan` rejects `out <= in`, `end <= start`, a shot past `duration`, and overlapping shots. `validate` on a missing field returns exactly `plan.json: shots[2].end is missing.` `MediaItem.labels` rejects more than 3 entries.
- [x] **Step 2:** Run `corepack pnpm test`. Expected: FAIL.
- [x] **Step 3:** Implement the schemas. Beyond §7 add `schemaVersion: 1`, `aspect`, `fps`, `seed` on `EditPlan`. Analysis fields not yet computed are `null`, meaning "not analysed". Durations and ranges use `{min, max}` objects so they map cleanly to Swift.
- [x] **Step 4:** Run the tests. Expected: PASS.

### Task 0.4: Swift package and generated types

**Files:** `packages/schema/scripts/gen-swift.ts`, `apps/mac/Package.swift`, `apps/mac/Sources/{UCut,ucut-vision,UCutSchema,schema-roundtrip}/`, `scripts/bundle-app.sh`, `packages/schema/src/swift.test.ts`.

**Interfaces:** Consumes the zod schemas through `z.toJSONSchema`. Produces `UCutSchema/Generated.swift`, with `Codable, Sendable` structs for the four schemas.

- [x] **Step 1: Write the failing test:** `swift.test.ts` asserts that regenerating Swift matches the committed file, and (on macOS) that `swift run schema-roundtrip <fixture>` outputs JSON that `validate` accepts for every fixture.
- [x] **Step 2:** Implement the generator, app window, `ucut-vision --version` (printing JSON) and `schema-roundtrip`.
- [x] **Step 3:** Run `swift build --package-path apps/mac` and `corepack pnpm test`. Expected: PASS.
- [x] **Step 4:** Run `scripts/bundle-app.sh`. Expected: `dist/U-Cut.app` launches and shows its window.

### Task 0.5: CI and contribution templates

**Files:** `.github/workflows/ci.yml`, `.github/ISSUE_TEMPLATE/{bug,template-request,new-template,asset-submission,classifier-category}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `scripts/license-scan.ts`, `scripts/check-dco.sh`, `scripts/license-scan.test.ts`.

**Interfaces:** `license-scan` exits non-zero on a disallowed dependency licence, a media file without an entry in `assets.json`, a video file in git, or `gsap` in a template.

- [x] **Step 1: Write the failing test:** feed `scanAssets` a temp tree with an unlisted `.wav`, an `.mp4`, and a template mentioning `gsap`. Assert three plain-sentence findings.
- [x] **Step 2:** Implement `scanDependencies()` and `scanAssets(root)`, allowlisting `@img/sharp-libvips-*` by name.
- [x] **Step 3:** Write the workflow: lint, typecheck, unit tests, schema check, `swift build`, licence scan and DCO check on `macos-15`.
- [x] **Step 4: Fresh-clone check:** commit with `-s`, `git clone` into a temp folder, follow only the README, expect every check to pass.

**Demo:** `corepack pnpm install && corepack pnpm test && scripts/bundle-app.sh && open dist/U-Cut.app`.

---

## Phase 1: Engine MVP, no AI

**Target:** `ucut make <folder> --template travel-montage -o out.mp4` produces a correct MP4 from a real phone dump, offline.

### Task 1.1: Library: fonts and music

Add OFL fonts to `library/fonts` (a display face, a body face and Noto Sans Devanagari), and write `scripts/make-music.ts` to synthesise four vibe tracks into `library/music` with `assets.json`. Test: `license-scan` passes and every track's measured BPM matches its metadata within 1.

### Task 1.2: Jobs and ingest

**Produces:** `createJob(inputs: string[], opts: JobOptions): Promise<Job>`, `ingest(job: Job): Promise<MediaItem[]>`, in `packages/engine/src/{job,ingest}.ts`, using `exifr` and `ffprobe`.

Tests: a generated tree with HEIC, rotated HLG HEVC, a Live Photo pair, `.AAE`, `.DS_Store`, a 0-byte file, spaces and emoji in names. Assert: one item per moment, correct displayed size, sorted by content hash, ids stable across runs. Insufficient disk gives a plain sentence.

### Task 1.3: Beat grid

**Produces:** `beatGrid(audio: string, duration: number): Promise<BeatGrid>` where `BeatGrid = {bpm: number | null; times: number[]; source: "detected" | "even"}`.

Tests: a 120 BPM fixture gives a 0.5 s grid within 10 ms; a beatless drone gives `source: "even"`; a 10 s track on a 30 s reel is looped in the plan.

### Task 1.4: Rules planner

**Produces:** `rulesPlanner: Planner` in `packages/planner-rules`, and `seededRng(seed)`.

Pure function, no I/O. Fills template sections from media, snaps cuts to the beat grid, sets saliency-free push-ins and pans, trims clips, and picks captions from template copy and EXIF. Tests: same input twice gives byte-identical JSON; shuffled input gives the same plan; every cut lands on a beat; 1 photo, 3 photos and one 40-minute video all give valid plans or a plain-sentence error; no media used twice unless the template allows it.

### Task 1.5: Compose

**Produces:** `compose(plan: EditPlan, template: Template, items: MediaItem[], job: Job): Promise<string>`.

Writes `project/`, generates one `@keyframes` rule per shot, copies only needed fonts and music. Tests: `hyperframes check` passes at 9:16, 1:1 and 16:9; output contains no `gsap` and no `http`; a Devanagari caption renders with glyph coverage.

### Task 1.6: Render and master

**Produces:** `hf.ts` from ADR 0001; `render(project, opts): Promise<string>`, `master(input, output): Promise<void>`, `verifyOutput(path): Promise<SpecReport>`.

Worker count derives from free memory. Tests: `hf.ts` rejects `publish` and `--quality best`; env switches are present; mastered output is −14 ±0.5 LUFS and ≤ −1 dBTP.

### Task 1.7: `ucut make`, the first template and the golden test

**Files:** `templates/travel-montage/`, `scripts/golden.ts`, `scripts/privacy-test.sh`, `packages/engine/src/make.ts`.

`ucut make` streams JSON progress events and writes `log.jsonl`. Tests: an HDR clip in the pile still gives H.264 SDR; a golden render at 360p within SSIM 0.995; the whole pipeline passes under the network-deny profile. CI gains `hyperframes check` on every template, the golden render and the privacy test. Then run it on real phone media and record timings.

---

## Phase 2: Classification

- **2.1 `ucut-vision`:** `classify`, `faces`, `ocr`, `saliency`, JSON on stdout. Vision's `ClassifyImageRequest`.
- **2.2 SigLIP:** convert the Apache-2.0 weights to Core ML, with a manifest and checksums in `classifiers/`. Run under 8 GB.
- **2.3 Taxonomy:** prompt sets per category, fusion of Vision and SigLIP scores, and an "Other" threshold.
- **2.4 Quality pass:** blur, exposure, noise, perceptual hash for near-duplicates, faces and smiles, saliency centres.
- **2.5 Moments:** 45-minute and 2 km gaps. Reverse geocoding stays opt-in.
- **2.6 Planner upgrade:** fill slots by label and quality, and use saliency crops.
- **2.7 Eval:** at least 300 labelled items with clear licences, `scripts/eval.ts` and a report. Target ≥ 85% top-1 on the 10 core categories, and 500 photos in ≤ 2 minutes. A small labelled subset runs in CI.

## Phase 3: Mac app MVP

- **3.1 LGPL FFmpeg** build and release asset ([0004](decisions/0004-ffmpeg-distribution.md)). Prove `--gpu` covers every path.
- **3.2 First-run setup:** bundled Node, FFmpeg, Chrome headless shell and models. Progress, size estimate, resume, checksums.
- **3.3 Engine bridge:** spawn `ucut`, stream events, cancel, one render at a time.
- **3.4 Drop zone and Photos picker.**
- **3.5 Sort view:** grids by bucket, drag to fix, corrections saved as local few-shot examples.
- **3.6 Template and vibe picker.**
- **3.7 Preview in WKWebView** and draft render. **3.8 Export.** **3.9 Job history and "Copy diagnostics".**

## Phase 4: Reference reels

- **4.1 Evaluate `measure`** on 5 to 10 real reels, and decide what `cuts`, `events` and `look` cover.
- **4.2 Analyser:** beats, cuts, cut alignment, Vision OCR for text, transition estimates, sections.
- **4.3 `StyleRecipe` writer** and the plain-English card.
- **4.4 Recipe template** driven entirely by a recipe.
- **4.5 Music matching** by BPM and energy. Tests prove no reference pixels or audio reach the output.

## Phase 5: Screen recordings and plain English

- **5.1 Transcribe** through `hf.ts`, with `--no-runtime-install` and models from setup, so nothing downloads mid-job.
- **5.2 Action moments:** cursor and click bursts, UI change, speech emphasis. Screen recordings use `--video-frame-format png`.
- **5.3 Pick confirmation** then push-ins, captions, title and end card from a brand form.
- **5.4 Script to voice:** 3 to 8 words per line, one `tts` call per line with its own speed. Voice install is on demand ([0009](decisions/0009-licence-exceptions.md)). Stock footage stays off, with a documented plug-in point for users who add their own key.
- **5.5 Kinetic captions,** and the app demo and explainer templates.

## Phase 6: Planner lanes

- **6.1 Surface for agents:** `ucut mcp` serves 14 tools over MCP, and `ucut render <job> [--project]` re-renders a job folder. Plans are checked with the schema and the job's media before they're saved.
- **6.2 Plugin:** `plugin/` bundles the server, a skill and three commands, and the repo is its marketplace. Both pass `claude plugin validate`. Still to do: a recorded session in Claude Code.
- **6.3 "Give this reel to your assistant"** in the app: a one-time link for the open reel, and a prompt to paste. Changes arrive as one undoable edit. Never spawns `claude`.
- **6.4 API lane:** key in the Keychain, a one-sentence disclosure for every choice, scripts only, on `claude-opus-5-5` through Anthropic's SDK.
- **6.5 Fallback:** a script or plan that doesn't fit is rejected, and the rules lane's stays.
- **6.6 Services:** ElevenLabs, Deepgram, OpenAI Whisper and Voice Studio for voices and listening, each off until chosen. Only the person at the Mac can change them, which is now decided by the socket rather than the `Host` header.

## Phase 7: Ship

- **7.1** `.dmg` build and tag-triggered release with changelog.
- **7.2** 8 starter templates with preview GIFs. A CC0 pack in `library/sfx` and `library/luts`, and vibe-driven grades and sound effects. CI builds `registry/index.json`, and the app reads it.
- **7.3** User guide, contributor guide, and how to open an unsigned app.
- **7.4** Full review against §10. Record any gap.
