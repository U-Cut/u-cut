# 0009. Licence exceptions

Status: accepted. The first item still needs the owner's nod.

The brief says no non-permissive dependency without asking. Two come in transitively through tools the brief itself mandates.

| Dependency                          | Licence           | Comes from              | Handling                                                                                                                                                                     |
| ----------------------------------- | ----------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@img/sharp-libvips-*`              | LGPL-3.0-or-later | `hyperframes` → `sharp` | Unmodified, dynamically loaded. Same footing as the LGPL FFmpeg the brief allows. Listed by name in the scan's allowlist. Installed at first run, not inside the app bundle. |
| `espeak-ng` (through `kokoro-onnx`) | GPL-3.0           | Kokoro voice            | Not in this repo or the app bundle. Runs in a separate Python process, installed only when a user first asks for a voiceover.                                                |

`scripts/license-scan.ts` fails on any other non-permissive licence, so adding a new exception means editing that list in a reviewed PR.

Other findings from checking the brief's table:

- SigLIP and SigLIP2 weights are published as Apache-2.0. No official Core ML or ONNX export turned up, so Phase 2 includes a conversion step, and the converted weights inherit the licence.
- ACE-Step's licence is reported inconsistently: the 1.5 model card says MIT, some third-party listings say Apache-2.0. Both are acceptable, but check the actual LICENSE file before enabling the add-on.
- aubio is GPL-3.0 and excluded ([0005](0005-analysis-through-hyperframes.md)).
- GSAP is excluded ([0002](0002-no-gsap-in-templates.md)).

These are engineering judgements, not legal advice.
