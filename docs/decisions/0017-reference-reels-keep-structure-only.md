# 0017. A reference reel gives structure, and nothing else

Status: accepted

## Context

The brief says a reference reel is used for structure only: its footage, audio and text must never reach the output. People will bring reels made by others, so this needs enforcing, not just promising.

## Decision

`ucut study` measures a reel with `hyperframes measure`, `hyperframes audio` and Apple's text recognition, and turns those measurements into a `StyleRecipe`.

- **The reel isn't kept.** The upload goes to a temporary folder outside the media store and is deleted once studied, including when studying fails.
- **Words are never read into U-Cut.** `ucut-vision text` returns only where text sits, how tall it is and whether it's in capitals. The recognised string never leaves the helper, so it can't be stored by accident. Text timing is inferred from the outline of the text changing.
- **Rhythm comes from the reel, and beats from the new music.** Shot lengths are rounded to whole beats of a licensed track chosen by tempo, so no audio is reused.
- **Colour is a gentle nudge.** Much of a reel's colour comes from its footage, so measurements are halved and capped.

`study.int.test.ts` proves it: the recipe and description hold none of the reel's words, the plan, the project and the store hold nothing from it, and the output doesn't resemble it.

## Consequences

Measured on a reel U-Cut made itself, where the true values are known: 128 BPM found as 128, 0.94 s shots found as 0.93 s, and capitals set low were read correctly.

It hasn't yet been tested on real reels from Instagram or similar, which may use dissolves and busier text. Transition types beyond a hard cut and an end fade aren't detected yet, and fonts aren't identified.
