# 0011. Defaults for the brief's open questions

Status: accepted until the owner says otherwise

| Brief §13 question               | Default                                                                                     | Why                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GitHub org or user               | `github.com/mayank29deo/U-Cut`, moved to `github.com/U-Cut/u-cut` on 2026-11-09 (see below) | The owner's SSH key authenticates as `mayank29deo`, and the name is free. |
| Minimum macOS                    | macOS 15, Apple Silicon only                                                                | The brief's recommendation. Builds confirmed.                             |
| Notarization                     | Unsigned until there's a paid Apple Developer account                                       | The docs will explain how to open an unsigned app.                        |
| In-app Claude subscription login | Not built                                                                                   | See [0008](0008-claude-subscription-stays-with-the-user.md).              |
| Template priority and brand look | Travel montage first, in the brief's order. A plain neutral UI until a brand exists.        | The brief names travel montage in Phase 1.                                |

## Performance target

The brief's speed targets assume an M1 with 16 GB. The owner's Mac is an A18 Pro with 8 GB, which is closer to what many everyday users have. We report results on this Mac as well, and tune worker counts for 8 GB.

Measured with the finished engine on this Mac: a 26.7 s reel from photos exported in 26.6 s, and an 18.6 s reel from 4K HEVC clips in 41.7 s. Both beat the brief's target of 3 minutes for 30 s.

## Commit identity

Commits use the GitHub noreply address, so a personal email stays out of the public history. DCO sign-off uses the same identity.

## Changed on 2026-11-09: U-Cut's home

The owner set up the `U-Cut` GitHub organisation for everything about U-Cut, including the website on Vercel and its database on Supabase. `github.com/U-Cut/u-cut` is now U-Cut's home: downloads, the installer, the template registry, the Claude Code plugin and every link point there. `github.com/mayank29deo/U-Cut` stays as a mirror that gets every push and tag, and only the home publishes releases. This was decided before the first release, so no published link had to change.
