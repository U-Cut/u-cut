# Templates

A template decides how a reel is paced and how its words look. U-Cut writes the actual composition from your plan, so the live preview and the final MP4 always match.

```
templates/<id>/
  template.json   Name, sections, shot lengths and supported shapes
  style.css       How the words look, for all four vibes
  README.md       What it's for, and credits
  preview.gif     Under 2 MB, made by scripts/make-previews.ts
```

## Add a template in five minutes

1. Copy `templates/travel-montage` and rename the folder.
2. Set a new `id` and `name` in `template.json`.
3. Change the shot lengths under `sections`. The first section is the hook, the last is the closer.
4. Restyle `.text-title` in `style.css`. Use `calc(N * var(--unit))` for sizes so every shape stays in proportion.
5. Run `ucut make library/samples --template <id> -o test.mp4` and watch it.
6. Add your template to `scripts/make-previews.ts`, then run `pnpm exec tsx --conditions=source scripts/make-previews.ts <id>` for its preview.
7. Run `pnpm registry`, so the gallery lists it.

Once it's merged, everyone can add it with **Get new styles** or `ucut templates update`, without a new app.

## Words on the shots

A template can ask the planner to label its shots, with `"labels"` in `template.json`:

| Value     | What appears                                                                      | Style it with |
| --------- | --------------------------------------------------------------------------------- | ------------- |
| `"time"`  | The time each photo was taken, such as "7:42 am", on shots of 0.8 seconds or more | `.text-stamp` |
| `"stops"` | "Stop 2", "Stop 3" where 30 minutes or more pass between photos                   | `.text-stop`  |

Day in my life and café crawl show both in use.

## Rules

- `hyperframes check` must pass on the composed reel. `pnpm test:int` does this for you.
- Keep all words inside the middle 80% of the frame.
- No GSAP and nothing from the network. Motion uses CSS keyframes.
- CSS only styles words. It can't use `url(`, `@import`, `image-set`, escapes or `<`, so a shared style can never load anything. The licence scan checks this, and U-Cut refuses a downloaded style that breaks it.
- Fonts come from `library/fonts`.
- Bundled media needs licence metadata in `assets.json`.
