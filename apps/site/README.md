# The U-Cut website

A single page that explains U-Cut and links to the repo and install guide. The reel on it is real: the page runs U-Cut's own planner, composer and player, using the free art and music in `library/`. It has no server, no accounts and no tracking.

The app itself can't run here. It needs FFmpeg, a rendering browser and a real computer, which is why it's installed rather than hosted. [ADR 0020](../../docs/decisions/0020-the-website-is-static.md) explains the split.

## Run it

```bash
pnpm --filter @u-cut/site dev
```

## Put it on Vercel

1. In Vercel, choose **Add New**, then **Project**, and import `U-Cut/u-cut`.
2. Set **Root Directory** to `apps/site`. Leave everything else as it is, because `vercel.json` has the build settings.
3. Press **Deploy**.

Every push to `main` then updates the site. To use your own domain, add it in the project's **Domains** settings.
