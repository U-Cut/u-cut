# 0016. Scenes come from Apple's on-device signals

Status: accepted for now. The accuracy target in the brief isn't met yet.

## Context

The brief pairs Apple Vision with a SigLIP model. SigLIP means a download of several hundred MB and a conversion step, on Macs that are often short of disk. Vision is already on every Mac and costs nothing to install.

Vision's 1,303 labels have no café or metro, so labels alone can't work. It also gives a 768-value feature print for each photo, a face detector and an aesthetics score, which also give us near-duplicates, best-shot picking and a selfie signal.

## Decision

A small linear model, about 80 KB, turns Vision's feature print and labels into U-Cut's 27 scenes. It's trained by `scripts/train-scenes.ts` on 2,146 freely licensed photos listed in `classifiers/eval/manifest.json`. Only the links are committed, never the photos. Accuracy is measured on whole sources held out of training.

Sources are chosen by hand, by what they are. An automatic search filed a rock band called The Beaches under `beach`. Sources are never removed because they score badly, since that would inflate the result.

Two rules came from real phone photos rather than from the dataset:

- A face covering 5% of the frame or more means People, whatever's behind it.
- The confidence cutoff is 0.30. At 0.45, most of a real camera roll went to Other, even though the best guess was usually right.

The near-duplicate threshold is 0.96, measured on the same photos. A wrong match silently drops a photo, so it leans towards keeping both.

## Consequences

Measured on 527 photos from places the model never saw:

| Measure                            | Result                                | Brief's target   |
| ---------------------------------- | ------------------------------------- | ---------------- |
| Top-1 accuracy, 10 core categories | 65%                                   | 85%              |
| Speed                              | About 40 photos a second at eval size | 500 in 2 minutes |
| Download needed                    | None                                  |                  |

On a small set of 28 real phone photos, 22 got a scene, and nearly all of those looked right when checked by eye. The other 6 went to Other. That's encouraging, but it's a small set, and the rules above were written after looking at it.

The weakest pairs are stations against metros, and city streets against markets. A wrong label costs one click to fix, and fixes are remembered.

Reaching 85% probably needs a stronger model. The next step is to measure SigLIP on this same held-out set and adopt it, as an optional download, only if it earns its size. `scripts/scene-accuracy.test.ts` stops the current score from slipping.

This is an engineering judgement rather than legal advice: the model holds statistics derived from the photos, not the photos, and `manifest.json` keeps each one's source and licence.
