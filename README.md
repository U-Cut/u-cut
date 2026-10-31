# U-Cut

**Turn what's already on your phone into a finished vertical reel. Free, open source, and entirely on your Mac.**

> **Status: early scaffold.** U-Cut can't make a video yet. The engine arrives in Phase 1 of the [plan](docs/PLAN.md).

## What it will do

Drop in any of these and get an MP4 back, with no timeline to learn:

| You bring                   | U-Cut                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------- |
| A pile of photos and clips  | Sorts them into scenes, picks the best shots, and cuts them to music                  |
| A reel you admire           | Studies its rhythm, text and colour, then rebuilds that structure with your own media |
| A screen recording          | Makes a product demo with zooms, captions and an end card                             |
| A sentence in plain English | Writes a script, voices it locally, and builds the reel                               |

## What makes it different

- **Local.** Your media stays on your Mac. Analysis, voice and rendering all run on your machine.
- **Free.** No per-render fees and no account needed. Claude is optional: if you already use Claude Code, U-Cut's plugin lets you direct your reels with it.
- **Open.** Apache-2.0 code, and community templates that anyone can add.

U-Cut learns the _structure_ of a reference reel. It never reuses that reel's footage or audio.

## Set up for development

You need macOS 15+ on Apple Silicon, Node 22+, FFmpeg, and the Xcode Command Line Tools. Xcode itself isn't required.

```bash
git clone https://github.com/mayank29deo/U-Cut.git
cd U-Cut
corepack enable
pnpm install
pnpm check
```

`pnpm check` runs lint, typecheck, tests and the licence scan.

To build the command-line tool and try it:

```bash
pnpm build
node packages/engine/dist/bin.js --version
```

To build and open the Mac app shell:

```bash
scripts/bundle-app.sh
open dist/U-Cut.app
```

## Project guide

| Read                               | For                             |
| ---------------------------------- | ------------------------------- |
| [docs/BRIEF.md](docs/BRIEF.md)     | The full product brief          |
| [docs/PLAN.md](docs/PLAN.md)       | The build plan, phase by phase  |
| [docs/decisions/](docs/decisions/) | Why things are the way they are |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute               |

## Licence

Code is [Apache-2.0](LICENSE). Each bundled asset lists its own licence in `assets.json`.
