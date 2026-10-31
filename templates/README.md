# Templates

Each template is a folder that turns an `EditPlan` into a HyperFrames project.

```
templates/<id>/
  template.json      TemplateManifest
  index.html         Root composition, with slots and variables as data-var-*
  compositions/      One scene per file
  preview.gif        Under 2 MB, rendered by CI
  README.md          What it's for, slot rules, credits
```

Rules:

- `hyperframes check` must pass.
- No network fetches at render time.
- Seeded randomness only.
- Copy and colours are variables.
- No GSAP. Use CSS keyframes, WAAPI or the seek protocol.
- Bundled media needs licence metadata in `assets.json`.

The first template arrives in Phase 1.
