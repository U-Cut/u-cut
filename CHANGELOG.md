# Changelog

Every release of U-Cut, newest first. Each version's section becomes its release notes.

## [0.1.0]

The first release you can download. U-Cut turns photos, clips, screen recordings or a sentence into a finished vertical reel, cut to music, on your own Mac.

### Get it

Download **U-Cut.dmg**, drag U-Cut into Applications and open it. The app carries everything it needs: Node, FFmpeg, the speech tool and the photo sorter. On first launch it downloads one more piece, the 93 MB exporter, with progress shown and resuming after a dropped connection. No Homebrew or Terminal needed.

U-Cut isn't notarized yet, so macOS asks you to approve it once: **System Settings → Privacy & Security → Open Anyway**. [The install guide](https://github.com/U-Cut/u-cut/blob/main/docs/INSTALL.md#open-it-the-first-time) has the steps.

### What it does

- **Photos and clips to a reel**, cut on the beat, in four vibes and five styles. Remix, swap or replace shots, change the shape, add a title, undo anything.
- **Two new styles:**
  - Café crawl numbers each stop of the day.
  - Day in my life stamps each shot with the time it was taken.
- **A style gallery,** where every style plays a preview. New styles can arrive without a new app, from **Get new styles** or `ucut templates update`.
- **Sound effects** at each reel's turning points, chosen by the vibe, and a switch to turn them off. Six effects, synthesised here, so they're CC0.
- **Colour looks** for each vibe, also as `.cube` LUTs for Resolve, Premiere, Final Cut or FFmpeg.
- **Sorting** photos into scenes on your Mac, leaving out screenshots and near-copies.
- **Matching a reel you love:** its rhythm, words and colour, never its footage.
- **Screen recordings to product demos,** with captions from what you said. Captions are a one-time 465 MB download, offered when you need it.
- **Reels from a sentence,** with a script you can edit and an optional voice that runs on your Mac.
- **Your assistant,** through `ucut mcp` and the Claude Code plugin. Optional services (Claude, ElevenLabs, Deepgram, OpenAI, Voice Studio) can be connected with your own keys.
- **Export** at 1080 × 1920, 30 fps, H.264 and AAC, balanced to −14 LUFS.

### Known gaps

- Sorting is right about two times in three on photos from new places. The target is 85%.
- U-Cut's own script writer follows fixed patterns. Connect Claude for scripts that know your topic.
- Captions and scripts are English only.
- Of the optional services, only Deepgram has been tested live.
- Matching a reel has been tested on generated reels, not yet on many saved ones.
- The app isn't notarized.
