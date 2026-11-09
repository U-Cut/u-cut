# Using U-Cut

U-Cut turns your photos, clips, screen recordings or a sentence into a finished vertical reel, cut to music, on your own Mac. This guide covers everything it does. To install it, start with [Get U-Cut](#get-u-cut).

## Get U-Cut

You need a Mac with Apple Silicon (M1 or newer) and macOS 15 or later.

1. Download **U-Cut.dmg** from the [releases page](https://github.com/mayank29deo/U-Cut/releases/latest).
2. Open it and drag **U-Cut** into **Applications**.
3. Open U-Cut. The first time, macOS asks you to approve it. [Opening it the first time](INSTALL.md#open-it-the-first-time) shows how.
4. U-Cut sets itself up in a few seconds, then downloads the one piece it needs to export: the part that draws every frame of your reel (93 MB). Press **Look around first** if you'd rather not wait. If your connection drops, it retries for a couple of minutes, and **Try again** carries on from where it stopped. If you looked around and the download didn't finish, pressing **Export** starts it again.

Everything else U-Cut needs is inside the app. Captions and the built-in voice are optional downloads, offered when you first need them.

## Make your first reel

1. **Add your photos and clips.** Drag them anywhere onto the window, or press **Try it with sample photos**. iPhone photos, Live Photos, HDR video and HEIC all work. Screenshots and near-copies are left out for you.
2. **Watch it.** The reel starts playing straight away, cut to the beat of the music.
3. **Pick a vibe** on the left. Chill, Hype, Cinematic or Nostalgic each changes the music, pace, colour and sound effects.
4. **Pick a style.** Press the style on the right to open the gallery, where every style plays a preview.
5. **Set the length and shape.** Tall (9:16) is for Reels, Shorts and TikTok. Square and Wide are for posts and YouTube.
6. **Add a title.** It appears on the reel as you type.
7. **Press Export,** then **Download MP4** and choose where to save it. Tall reels are 1080 × 1920 (Square 1080 × 1080, Wide 1920 × 1080), at 30 frames a second, balanced to −14 LUFS like reels on the big apps.

While you edit:

| To                                     | Do this                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| Get a different cut of the same photos | Press **Remix**, or R                                      |
| Undo or redo                           | ⌘Z and ⇧⌘Z                                                 |
| Swap two shots                         | Drag one shot onto another in the strip along the bottom   |
| Replace a shot                         | Press the shot, then pick the photo or clip to use instead |
| Jump between shots                     | ← and →                                                    |
| Play or pause                          | Space, when no button is selected                          |
| Turn the sound effects off             | Set **Sound effects** to Off                               |
| Leave out a scene, such as food photos | Press **Sort your photos**, then switch the scene off      |

## Styles

A style decides how your photos are paced and how the words look. Your vibe still picks the music and colour.

| Style          | What it does                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Travel montage | A fast opener, then the trip in order, ending on one long look                                                 |
| Weekend recap  | Even, easy pacing with a clean centred title                                                                   |
| City walk      | Quick street rhythm with a big, loud title                                                                     |
| Café crawl     | Each place in the order you went, numbered "Stop 1", "Stop 2"… whenever 30 minutes or more pass between photos |
| Day in my life | Your day in order, with the time each shot was taken in the corner ("7:42 am")                                 |

Three more styles are made for you by the other ways in. **Product demo** is for screen recordings, **Your words** for reels from a sentence, and **Your reel's style** for matching a reel you love.

**New styles** arrive without a new app. In the gallery, press **Get new styles**, or run `ucut templates update` ([from the command line](#from-the-command-line)). U-Cut checks its free library on GitHub and adds any style that's new or newer than yours. It checks every file against the library's list, and refuses any style that would load something from the internet. It only downloads: nothing about your reels is sent.

## Sound effects and colour

Each vibe adds a few sound effects at the reel's turning points. Hype and Cinematic open on a hit and rise into the last shot, and Hype adds a whoosh now and then. Chill opens on a soft swell. Nostalgic uses a camera shutter. Café crawl adds a soft pop for each stop. The preview plays them exactly as the export will.

Each vibe also has its own colour grade. To use the same look on other footage, take the matching `.cube` file from [library/luts](https://github.com/mayank29deo/U-Cut/tree/main/library/luts) into DaVinci Resolve, Premiere, Final Cut or FFmpeg. Every effect and look is CC0, so you can use them anywhere.

## Sort your photos

U-Cut sorts photos into scenes on your Mac, such as café, mountains, beach or night city, using Apple's on-device recognition. Press **Sort your photos** to see the groups. Drag a photo to the right group if it's wrong, and switch off any group you don't want in the reel.

Sorting is right about two times in three on photos from new places, so expect to fix a few.

## Match a reel you love

Press **Match a reel you love** and choose a video you've saved. U-Cut learns its rhythm, how its words look and its colour, then rebuilds that with your photos. Nothing from that reel appears in yours: not its footage, sound or words. To go back, pick a vibe or a style.

## Turn a screen recording into a demo

On the first screen, press **Turn a screen recording into a demo** and choose a recording, from QuickTime or ⌘⇧5. U-Cut finds the moments where something happens, pushes in on each one, and adds a title card and end card with your product's name and colour.

Captions come from what you said, if the recording has your voice. They need the speech model, a one-time 465 MB download that stays on your Mac. U-Cut offers it the first time you need it, with **Add captions**. You can also connect a service such as Deepgram for listening (see [Connect your assistant and services](CONNECT.md)).

## Write a reel from a sentence

Type what you want in **Or just describe it**, for example "a 20-second reel about my Goa trip, chill vibe". U-Cut writes a short script and builds the reel from your photos, or from words and moving colour if you have none. You can edit every line, or write your own.

To have it read aloud, choose a voice. The built-in voice is a one-time download of about 500 MB that runs on your Mac. Connected services such as Deepgram offer more voices (ElevenLabs and Voice Studio are built in too, but not yet tested live).

U-Cut's own script writer follows fixed patterns. Connecting Claude with your own key gives scripts that know your topic (built, but not yet tested live).

## Use it with your assistant

Claude Code, Claude Desktop, Cursor and other assistants can make and change reels through U-Cut. Open **Connections** in the app for the line to paste, or read [Connect your assistant and services](CONNECT.md).

The app keeps its own `ucut` command at `~/Library/Application Support/U-Cut/bin/ucut`, so assistants can use it without a separate install.

## From the command line

Everything in the app works from Terminal too. The app keeps its own `ucut` command. To use it in Terminal, add this line to `~/.zshrc`, then open a new Terminal window:

```bash
alias ucut="'$HOME/Library/Application Support/U-Cut/bin/ucut'"
```

Then:

```bash
ucut make ~/Pictures/Goa --vibe hype --title "Goa, day one" -o goa.mp4
ucut make ~/Pictures/Goa --template day-in-my-life -o day.mp4
ucut make ~/Pictures/Goa --like a-reel-i-love.mp4 -o goa.mp4
ucut make ~/Pictures/Goa --no-sfx -o quiet.mp4
ucut demo recording.mov --name "Acme" --colour "#7b5cff" -o demo.mp4
ucut write "a 20-second reel about my Goa trip, chill vibe" ~/Pictures/Goa -o goa.mp4
ucut templates update
ucut doctor
```

Run `ucut <command> --help` for every option.

## What goes online, and when

Making, sorting, previewing and exporting reels never use the internet. These are the only times U-Cut goes online, and each one happens once or only when you ask:

| When                           | What                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| The first time you open it     | Downloads the exporter (93 MB) from Google's Chrome for Testing   |
| You press **Add captions**     | Downloads the speech model (465 MB) from Hugging Face             |
| You press **Add a voice**      | Downloads the voice (about 500 MB) from GitHub and Python's index |
| You press **Get new styles**   | Reads U-Cut's style list on GitHub and downloads any new style    |
| You connect a service          | Checks your key with that service                                 |
| You choose a service for a job | Sends only what that job needs, as Connections describes          |

U-Cut has no account, no analytics and no telemetry.

## Where your files go

| What                             | Where                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Exported reels                   | Wherever you save them. U-Cut also keeps a copy, under a coded name, in `~/Movies/U-Cut/renders` |
| Your media and editable projects | `~/Movies/U-Cut`                                                                                 |
| Styles you added                 | `~/Movies/U-Cut/templates`                                                                       |
| U-Cut's tools and the exporter   | `~/Library/Application Support/U-Cut`                                                            |
| The speech model and the voice   | `~/.cache/hyperframes` and `~/.cache/u-cut`                                                      |

Every reel has an editable HyperFrames project in `~/Movies/U-Cut/jobs/<id>/project`, which you can open in the HyperFrames desktop app.

## If something goes wrong

Start with `ucut doctor` ([from the command line](#from-the-command-line)), which checks every part U-Cut needs. The [install guide](INSTALL.md#if-something-goes-wrong) lists common problems and fixes. Still stuck? [Open an issue](https://github.com/mayank29deo/U-Cut/issues/new/choose) with what `ucut doctor` says.
