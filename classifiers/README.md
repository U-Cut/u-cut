# Classifiers

How U-Cut sorts photos into scenes. It runs entirely on your Mac and needs no download.

Apple's Vision framework, built into macOS, looks at each photo and gives a feature print and a set of labels. A small model trained here turns those into U-Cut's scenes. When it isn't sure, the photo goes to Other, because a wrong guess is worse than an honest "don't know".

| File                 | What it is                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `taxonomy.yaml`      | Every scene, and its name in the app                                 |
| `scene-model.json`   | The trained model                                                    |
| `eval/report.md`     | How accurate it is, measured on places it never saw                  |
| `eval/manifest.json` | The labelled photos: links and licences, never the photos themselves |
| `eval/fixture.json`  | The held-out test set, reduced to signals, which CI re-checks        |

## How accuracy is measured

Whole sources are held out of training, so a photo of a station is never judged by other photos of that same station. This is much harder than a random split, and it's what your own photos will be like. The score in `eval/report.md` comes from these unseen places.

## Add a category

1. Add it to `taxonomy.yaml`.
2. Add sources for it in `scripts/eval-manifest.ts`, then run that script.
3. Download the photos and collect their signals:

   ```bash
   pnpm exec tsx scripts/eval-fetch.ts ~/ucut-eval
   swift build --package-path apps/mac -c release --product ucut-vision
   find ~/ucut-eval -name '*.jpg' | apps/mac/.build/release/ucut-vision analyze > ~/ucut-eval/signals.jsonl
   ```

4. Train it: `pnpm train:scenes ~/ucut-eval/signals.jsonl`.
5. Check that `eval/report.md` didn't get worse, and include it in your pull request.
