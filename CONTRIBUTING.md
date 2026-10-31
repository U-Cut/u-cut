# Contributing to U-Cut

Thanks for helping. U-Cut is early, so read the [plan](docs/PLAN.md) first to see what's being built now.

## Set up

Follow the steps in the [README](README.md#set-up-for-development). Run `pnpm check` before you open a pull request.

## Sign your commits

Every commit needs a [Developer Certificate of Origin](https://developercertificate.org/) sign-off, which confirms you have the right to submit the work:

```bash
git commit -s -m "feat: add metro walk template"
```

CI rejects commits without one. To fix your last commit, run `git commit --amend -s`.

## Good first contributions

- **Better music.** Our starter tracks are synthesised to prove the pipeline. Real CC0 tracks would be a big upgrade.
- **New templates.** See [templates/README.md](templates/README.md).
- **Classifier categories.** Add a scene to `classifiers/taxonomy.yaml` with its prompt set.

## Rules that keep the project healthy

- **Local first.** Nothing in a default path may touch the network. A test enforces this.
- **Permissive licences only.** Bundled assets must be CC0, CC-BY, OFL, Apache-2.0 or MIT, listed in `assets.json` with proof. Don't copy third-party asset libraries into this repo.
- **No GSAP.** Templates use CSS keyframes, WAAPI or the seek protocol. [Here's why](docs/decisions/0002-no-gsap-in-templates.md).
- **No video files in git.** Tests generate their own media. Only preview GIFs under 2 MB are allowed.
- **Seeded randomness only.** The same inputs must give the same plan.
- **Dependencies.** Ask in an issue before adding one with a non-permissive licence.

## Recording decisions

If your change makes a real design choice, add a short file to `docs/decisions/`, numbered in sequence.

## Pull requests

Fill in the PR checklist. Keep each PR to one change, with tests. For anything large, open an issue first so we can agree on the approach.

## Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md).
