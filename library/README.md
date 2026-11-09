# Library

Shared assets that templates can use. Every file is listed in the `assets.json` beside it, with its licence and source.

| Folder    | Holds                      | Allowed licences |
| --------- | -------------------------- | ---------------- |
| `music/`  | Background tracks          | CC0              |
| `sfx/`    | Sound effects              | CC0              |
| `fonts/`  | Fonts                      | OFL              |
| `luts/`   | Colour looks               | CC0              |
| `blocks/` | Our own HyperFrames blocks | Apache-2.0       |

Don't copy registry blocks here. Add them to a template with `hyperframes add`.

The music, sound effects and looks are made by scripts, so they're CC0 and can be made again:

| Folder   | Made by                 | What's in it                                                                                                      |
| -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `music/` | `scripts/make-music.ts` | One track per vibe                                                                                                |
| `sfx/`   | `scripts/make-sfx.ts`   | Whoosh, hit, riser, swell, shutter and pop. `packages/planner-rules/src/sfx.ts` decides where each vibe uses them |
| `luts/`  | `scripts/make-luts.ts`  | Each vibe's colour grade as a 17-point `.cube` LUT, matching the CSS filter U-Cut renders with                    |

After changing anything here, run `pnpm registry`.
