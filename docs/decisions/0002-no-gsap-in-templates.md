# 0002. Templates do not use GSAP

Status: accepted

## Context

HyperFrames' docs and scaffolds assume GSAP. That conflicts with two non-negotiables in the brief:

- **Network.** `hyperframes init` loads GSAP from `cdn.jsdelivr.net` at render time.
- **Licences.** GSAP uses the Standard "No Charge" License, not an open-source licence. Every bundled asset must be CC0, CC-BY, OFL, Apache-2.0 or MIT. Its terms also restrict use in products that let people create or edit animations through a visual builder, which is uncomfortably close to a template-driven video app.

HyperFrames also drives CSS `@keyframes` and WAAPI natively. A GSAP-free composition using only CSS keyframes passed `lint` and `check`, and rendered correct push-ins, pans and caption entrances with no network.

## Decision

- Generated compositions and first-party templates use CSS `@keyframes`, WAAPI, or the `hf-seek` protocol. The root sets `data-no-timeline`.
- A registry block that needs GSAP can't go into a shipped template. Look for a GSAP-free block first, then reimplement the effect under Apache-2.0.
- CI fails any template or `library/blocks` file that references `gsap`.

## Consequences

The brief's advice to search the registry before hand-building still applies, but many registry blocks will not qualify. Writing `compose` becomes simpler: one `@keyframes` rule per shot, generated from the `EditPlan`, which stays readable for people who open the project folder.
