---

name: u-cut
description: Make finished vertical reels and product demos with U-Cut on this computer, from photos and clips, a reel the person admires, a screen recording or a sentence, rendered with HyperFrames. Use whenever someone wants a reel, a short, a video from their photos, a product demo from a screen recording, a reel in the style of another, or to work on the reel they have open in the U-Cut app.
---

# Making reels with U-Cut

U-Cut is installed on this computer as the `ucut` command, and this plugin connects its tools (`mcp__u-cut__*`). If the tools are missing, U-Cut isn't installed: point the person to https://github.com/mayank29deo/U-Cut. Renders use HyperFrames and take about as long as the reel.

U-Cut itself sends nothing anywhere unless the person chose a service in its Connections, such as a cloud voice; `status` shows what each job uses. What the tools return to you, such as file names, dates, transcripts and scripts, reaches your own model like anything else you read, so don't open or pass on their photos or recordings unless they ask.

Start with `status` to see what's set up, and `catalog` for the styles, vibes, scenes and voices.

## Pick the path from what they have

| They have                    | Do this                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photos and clips             | `read_media` to see the scenes and moments, then `plan_reel`, then `render`.                                                                                                                  |
| A reel they admire           | `plan_reel` with `like` set to that reel. Only its rhythm, text style and colour are used, never its footage, sound or words.                                                                 |
| A screen recording           | `read_recording` with the product's name in `hints`, choose the moments, then `make_demo` with the name and colour.                                                                           |
| An idea or a sentence        | `write_reel`. Write the lines yourself (below) rather than passing only a prompt.                                                                                                             |
| A reel open in the U-Cut app | They copy a link from Connections, "Give this reel to your assistant". Read it with `app_reel` and change it with `app_change`; the change appears in their window as one edit they can undo. |

## Write the script yourself

U-Cut's own writer uses fixed patterns, so you'll write better lines. For `write_reel` and `app_change`:

- 3 to 8 words a line, one thought per line, said out loud. About 3 words a second of reel.
- Open with a hook and close softly. No hashtags, emoji or quotation marks.
- Set `scene` on a line to a scene id from `read_media` when the line is about it, in the order the photos happened.
- Use only what they told you and what's in their media. Don't invent names, places or numbers.

## Change a reel before it renders

`plan_reel` and `get_plan` return `plan.json`. You can reorder `shots`, change `in` and `out` on clips, edit `texts`, or change the `title`, then `save_plan`. Times are seconds. Shots must use media ids from the job. `save_plan` says in plain words what doesn't fit; fix it and save again. Then `render`.

## Beyond U-Cut's styles: HyperFrames

Every job folder has a `project/` folder, which is a HyperFrames project. With the HyperFrames skills installed (the `hyperframes` plugin), you can edit `project/index.html`: add registry blocks, motion or effects, following the HyperFrames contract. Then call `render` with `project: true`. U-Cut still masters the sound and checks the file.

## Good to know

- Ask before making several renders in a row; each one takes about as long as the reel.
- Outputs go to the Movies/U-Cut folder unless they name a place.
- If `status` says the voice or captions aren't installed, tell them to run `ucut setup --voice` or `ucut setup --speech`.
- Connected services (Claude, ElevenLabs, Deepgram, OpenAI, Voice Studio) are chosen in the app's Connections, or with `ucut connections`. Never ask for or handle their API keys yourself.
