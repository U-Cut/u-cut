# Templates

A template decides how a reel is paced and how its words look. U-Cut writes the actual composition from your plan, so the live preview and the final MP4 always match.

```
templates/<id>/
  template.json   Name, sections, shot lengths and supported shapes
  style.css       How the words look, for all four vibes
  README.md       What it's for, and credits
  preview.gif     Under 2 MB (added when we publish the template gallery)
```

## Add a template in five minutes

1. Copy `templates/travel-montage` and rename the folder.
2. Set a new `id` and `name` in `template.json`.
3. Change the shot lengths under `sections`. The first section is the hook, the last is the closer.
4. Restyle `.text-title` in `style.css`. Use `calc(N * var(--unit))` for sizes so every shape stays in proportion.
5. Run `ucut make library/samples --template <id> -o test.mp4` and watch it.

## Rules

- `hyperframes check` must pass on the composed reel. `pnpm test:int` does this for you.
- Keep all words inside the middle 80% of the frame.
- No GSAP and nothing from the network. Motion uses CSS keyframes.
- Fonts come from `library/fonts`.
- Bundled media needs licence metadata in `assets.json`.
