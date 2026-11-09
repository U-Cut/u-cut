# Contributing to U-Cut

Thanks for helping. U-Cut is early, so read the [plan](docs/PLAN.md) first to see what's being built now.

## Set up

Follow the steps in the [README](README.md#build-it-yourself). Then run the app with `pnpm start`. To work on the interface with live reload, run `pnpm start` in one terminal and `pnpm --filter @u-cut/web dev` in another.

Before you open a pull request, run `pnpm check`. If you changed the engine, run `pnpm test:int` too. If you changed the interface, run `pnpm test:e2e ./shots` and look at the screenshots.

New here? [How U-Cut works](docs/ARCHITECTURE.md) explains the system and [the design guide](docs/DESIGN.md) explains the interface.

## Sign your commits

Every commit needs a [Developer Certificate of Origin](https://developercertificate.org/) sign-off, which confirms you have the right to submit the work:

```bash
git commit -s -m "feat: add metro walk template"
```

CI rejects commits without one. To fix your last commit, run `git commit --amend -s`.

## Good first contributions

- **Better music.** Our starter tracks are synthesised to prove the pipeline. Real CC0 tracks would be a big upgrade.
- **Recorded sound effects.** The six in `library/sfx` are synthesised too. CC0 recordings would sound more natural.
- **New templates.** See [templates/README.md](templates/README.md). A new style reaches everyone's app through the registry, without a release.
- **Classifier categories.** Add a scene to `classifiers/taxonomy.yaml` with its prompt set.

## Where the pieces come from

Everything bundled is either written by hand or made by a script in `scripts/`, so it can be checked and made again.

| To change                              | Edit                                  | Then run                                                          |
| -------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Music                                  | `scripts/make-music.ts`               | `pnpm exec tsx scripts/make-music.ts`                             |
| Sound effects                          | `scripts/make-sfx.ts`                 | `pnpm exec tsx scripts/make-sfx.ts`                               |
| Where a vibe puts its sound effects    | `packages/planner-rules/src/sfx.ts`   | `pnpm test`                                                       |
| A vibe's colour                        | `packages/planner-rules/src/vibes.ts` | `pnpm exec tsx --conditions=source scripts/make-luts.ts`          |
| A template's look or pacing            | `templates/<id>/`                     | `pnpm exec tsx --conditions=source scripts/make-previews.ts <id>` |
| Anything in `templates/` or `library/` |                                       | `pnpm registry`, which `pnpm check` insists on                    |
| The app icon                           | `apps/mac/Icon/AppIcon.svg`           | `pnpm exec tsx scripts/make-icon.ts`                              |
| The data shapes                        | `packages/schema/src/`                | `pnpm gen:swift`                                                  |

## Build the Mac app

`scripts/bundle-app.sh` builds a quick app that runs the engine from your checkout. It's what `install.sh` uses.

`scripts/package-mac.sh` builds the one people download: `dist/U-Cut.app` with Node, FFmpeg, whisper-cli, the photo sorter and the engine inside, and `dist/U-Cut.dmg`. The first time, it builds FFmpeg and whisper-cli from source, which needs:

```bash
brew install cmake autoconf automake libtool pkg-config
```

Those builds are kept in `dist/tools`, so later runs take about half a minute. Then check the app the way a new Mac would meet it:

```bash
scripts/check-package.sh              # with an empty home folder and no Homebrew on the PATH
scripts/check-package.sh --download   # and download the exporter as well, as a new Mac does
```

[Why the app is built this way](docs/decisions/0024-the-app-carries-its-own-tools.md).

## Make a release

1. Set the new version in every `package.json`, the same in each.
2. Add its section to `CHANGELOG.md`, under `## [x.y.z]`.
3. Commit, then tag and push: `git tag vx.y.z && git push origin vx.y.z`.

The [release workflow](.github/workflows/release.yml) builds and checks the app on a clean machine. It then publishes `U-Cut.dmg`, its checksum and FFmpeg's source, with the changelog as the notes. With the Apple Developer secrets it lists, it also signs and notarizes the app. A change to how the app is packaged runs the same build on `main`, without publishing.

## Rules that keep the project healthy

- **Local first.** Nothing in a default path may touch the network. A test enforces this.
- **Permissive licences only.** Bundled assets must be CC0, CC-BY, OFL, Apache-2.0 or MIT, listed in `assets.json` with proof. Don't copy third-party asset libraries into this repo.
- **No GSAP.** Templates use CSS keyframes, WAAPI or the seek protocol. [Here's why](docs/decisions/0002-no-gsap-in-templates.md).
- **No video files in git.** Tests generate their own media. Only preview GIFs under 2 MB are allowed.
- **Templates only style words.** Their CSS can't use `url(`, `@import` or anything that runs code, so a shared style can never reach the network.
- **Seeded randomness only.** The same inputs must give the same plan.
- **Dependencies.** Ask in an issue before adding one with a non-permissive licence.

## Recording decisions

If your change makes a real design choice, add a short file to `docs/decisions/`, numbered in sequence.

## Pull requests

Fill in the PR checklist. Keep each PR to one change, with tests. For anything large, open an issue first so we can agree on the approach.

## Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md).
