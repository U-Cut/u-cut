# 0011. Defaults for the brief's open questions

Status: accepted until the owner says otherwise

| Brief §13 question               | Default                                                                              | Why                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| GitHub org or user               | `github.com/mayank29deo/u-cut`                                                       | The owner's SSH key authenticates as `mayank29deo`, and the name is free. |
| Minimum macOS                    | macOS 15, Apple Silicon only                                                         | The brief's recommendation. Builds confirmed.                             |
| Notarization                     | Unsigned until there's a paid Apple Developer account                                | The docs will explain how to open an unsigned app.                        |
| In-app Claude subscription login | Not built                                                                            | See [0008](0008-claude-subscription-stays-with-the-user.md).              |
| Template priority and brand look | Travel montage first, in the brief's order. A plain neutral UI until a brand exists. | The brief names travel montage in Phase 1.                                |

## Performance target

The brief's speed targets assume an M1 with 16 GB. The owner's Mac is an A18 Pro with 8 GB, which is closer to what many everyday users have. We report results on this Mac as well, and tune worker counts for 8 GB.

Early numbers on this Mac, from synthetic media (real footage will be slower): an 8 s reel took 12 s at draft and 15 s at the `looks` quality level, which suggests about 1 minute for a 30 s reel.

## Commit identity

Commits use the GitHub noreply address, so a personal email stays out of the public history. DCO sign-off uses the same identity.
