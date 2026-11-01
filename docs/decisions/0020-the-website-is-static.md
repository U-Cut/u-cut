# 0020. The website is a static page, and the app stays on people's computers

Status: accepted

## Context

U-Cut needs a website that explains it and links to the repo and install guide. The obvious shortcut would be to host `apps/web`, but that interface only works with the engine behind it, which needs FFmpeg, a rendering browser, Apple's Vision and long-running processes. It also promises that files stay on your computer, and a hosted app would break that promise.

## Decision

`apps/site` is a separate static page, hosted on Vercel from this repo. It's plain HTML with a small script, so it can be read without JavaScript.

The reel on the page is real. Planning, composing and playback already run in the browser ([ADR 0013](0013-browser-plans-server-exports.md)), so the site uses the same code with U-Cut's free sample art and music. Someone can type a sentence and watch it cut, with no server involved. The player is imported straight from `apps/web`, so the two can't drift apart.

No video goes in the repo for this ([ADR 0007](0007-media-in-the-repo.md)). The screen recording example is a still of U-Cut's own interface, moved the way a demo moves, and the page doesn't read a recording.

## Consequences

- The page can't voice a script or export a video. It says so, and points to the install.
- `library/` files are copied in at build time, so the site needs no media of its own in git.
- The site has no analytics, cookies or forms, so there's nothing to secure beyond its headers, which are in `vercel.json`.
