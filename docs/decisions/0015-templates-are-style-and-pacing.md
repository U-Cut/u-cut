# 0015. A template is pacing and style

Status: accepted. Replaces the template folder layout in the brief's §8.

## Context

The brief gives each template its own HyperFrames `index.html` and scene files. But the reel is generated from a plan, and the live preview has to rebuild it in milliseconds in the browser. Per-template scene files would need compiling on every Remix and would make each template a small program.

## Decision

A template is `template.json` (sections and shot lengths) plus `style.css` (how the words look). One composer in `packages/compose` turns any plan into the final composition.

## Consequences

Adding a template takes minutes and needs no HyperFrames knowledge, which suits a community library. Templates can't yet add their own animated scenes. When one needs that, we'll add it to the composer as a named feature, so it stays fast and offline.
