# Installing U-Cut

## Download the app

This is the way for most people. You need a Mac with Apple Silicon (M1 or newer) and macOS 15 or later.

1. Download **U-Cut.dmg** from the [latest release](https://github.com/U-Cut/u-cut/releases/latest).
2. Open it, and drag **U-Cut** into **Applications**.
3. Open U-Cut from Applications. The first time, macOS asks you to approve it (see below).
4. U-Cut sets itself up in a few seconds, then downloads the one piece it needs to export (93 MB). Press **Look around first** if you'd rather not wait.

The app carries Node, FFmpeg, the speech tool and the photo sorter itself, so you don't need Homebrew or Terminal. It takes about 330 MB, plus the exporter. Captions and the built-in voice are optional downloads, offered when you first need them.

### Open it the first time

U-Cut isn't notarized by Apple yet, because that needs a paid Apple Developer account. So the first time you open it, macOS stops it and asks you to confirm. On macOS 15 and later:

1. Open U-Cut. macOS says **"U-Cut" Not Opened**. Press **Done**.
2. Open **System Settings**, then **Privacy & Security**.
3. Scroll down to **Security**. Next to "U-Cut was blocked to protect your Mac", press **Open Anyway**.
4. Enter your Mac's password, then press **Open Anyway** once more.

From then on, that copy of U-Cut opens like any other app. Each new version is a new download, so macOS asks once more after you update. Right-clicking the app and choosing **Open** no longer skips this on macOS 15.

Every release is built in public by [GitHub Actions](https://github.com/U-Cut/u-cut/actions/workflows/release.yml) from the code in this repository. Each one lists the disk image's SHA-256, which you can compare with yours:

```bash
shasum -a 256 ~/Downloads/U-Cut.dmg
```

## Install with Terminal

This way suits developers, Linux and Docker users, and anyone who wants the `ucut` command on their PATH. On a Mac with Apple Silicon, paste this into Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/U-Cut/u-cut/main/install.sh | bash
```

It takes a few minutes the first time and uses about 2 GB of disk. To skip the 465 MB speech model, which only captions need, put `UCUT_NO_SPEECH=1` before `bash`. It does the following:

1. Installs Node and FFmpeg with Homebrew, if they're missing. If you don't have Homebrew, it stops and tells you where to get it.
2. Downloads U-Cut into `~/.u-cut`.
3. Installs its dependencies and builds it.
4. Downloads the browser U-Cut renders with, and the speech model for captions.
5. Adds the `ucut` command to `~/.local/bin`.
6. Builds the Mac app into `~/Applications`, if you have the Xcode Command Line Tools. Without them, U-Cut still works in your browser.
7. Runs `ucut doctor` to check everything.

The installer is a plain script, so you're welcome to [read it](../install.sh) first.

If Terminal says `ucut: command not found`, add this line to `~/.zshrc`, then open a new Terminal window:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Start it

| Way                    | How                                                 |
| ---------------------- | --------------------------------------------------- |
| Mac app                | Open U-Cut from Applications                        |
| Browser                | Run `ucut`, which opens <http://localhost:4173>     |
| Different port         | Run `ucut serve --port 8080`                        |
| One reel, no interface | Run `ucut make <folder> -o reel.mp4`                |
| See how photos sort    | Run `ucut sort <folder>`                            |
| Learn a reel's style   | Run `ucut study reel.mp4`                           |
| Copy that style        | Run `ucut make <folder> --like reel.mp4 -o new.mp4` |

## On Linux or anywhere else

### With Docker

```bash
docker build -t u-cut https://github.com/U-Cut/u-cut.git
docker run --rm -p 127.0.0.1:4173:4173 -v u-cut-data:/data u-cut
```

Then open <http://localhost:4173>. Your reels stay in the `u-cut-data` volume. Docker has no access to Apple's video hardware, so exports use the CPU and take longer.

### Without Docker

Install Node 22 or newer, FFmpeg, and Git with your package manager, then run the same installer command as on a Mac. HEIC photos may not work outside macOS, so convert them to JPEG first if they're skipped. Windows isn't supported yet.

## Share one computer with other people

```bash
ucut serve --lan
```

U-Cut prints a link containing a private code. Anyone on your network with that link can use it from their own browser, and each person only sees their own reels. Share the link only with people you trust, since uploaded media is stored on your computer. Stop sharing by pressing Ctrl+C.

[The architecture guide](ARCHITECTURE.md#what-20-people-get) explains how many people a machine can serve.

## Where your files go

| What                                    | Where                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Reels, your media and editable projects | `~/Movies/U-Cut`                                                                        |
| Styles you added                        | `~/Movies/U-Cut/templates`                                                              |
| The downloaded app's tools and exporter | `~/Library/Application Support/U-Cut`                                                   |
| The code, if you used the installer     | `~/.u-cut`                                                                              |
| The `ucut` command                      | `~/.local/bin/ucut`, or the app's own at `~/Library/Application Support/U-Cut/bin/ucut` |
| The speech model and the voice          | `~/.cache/hyperframes`, `~/.cache/u-cut`                                                |

Set `UCUT_HOME` to keep reels and media somewhere else, such as an external drive.

Every reel has an editable HyperFrames project in `~/Movies/U-Cut/jobs/<id>/project`.

## Update

**The app:** quit U-Cut, open the new **U-Cut.dmg**, drag U-Cut into Applications and choose **Replace**. macOS asks you to approve it again, [as before](#open-it-the-first-time). The first launch after an update takes a few seconds longer while it sets the new version up. Your reels stay.

**The installer:** run the install command again. It keeps your reels.

## Uninstall

If you connected any services, forget their keys first. With the app, run:

```bash
for service in claude elevenlabs deepgram openai voicestudio; do
  "$HOME/Library/Application Support/U-Cut/bin/ucut" disconnect "$service"
done
```

With the installer, use `ucut disconnect "$service"` in the same loop.

Then remove U-Cut:

```bash
rm -rf /Applications/U-Cut.app "$HOME/Library/Application Support/U-Cut" ~/Library/Logs/U-Cut
rm -rf ~/.u-cut ~/.local/bin/ucut ~/Applications/U-Cut.app   # if you used the installer
rm -rf ~/.cache/u-cut ~/.cache/hyperframes                   # the speech model and the voice
```

To delete your reels and media too, also remove `~/Movies/U-Cut`, which also holds your connection choices. The installer added a line beginning "# Added by the U-Cut installer" to `~/.zprofile`, which you can delete.

## If something goes wrong

Start with `ucut doctor`. With the downloaded app, the command is `"$HOME/Library/Application Support/U-Cut/bin/ucut" doctor`, or set up the short name as the [user guide](GUIDE.md#from-the-command-line) shows. The commands below work the same way. It checks Node, FFmpeg, the rendering browser and disk space.

| Problem                                     | Fix                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Rendering browser: Not installed`          | Run `ucut setup`. In the app, press Export, and it downloads it                                                                                            |
| The first-run screen says it's waiting      | Your connection dropped. It retries for a couple of minutes. If it stops, press Try again when you're back online, and it carries on from where it stopped |
| The app says captions need the speech model | Click Add captions, or run `ucut setup --speech`. Then press New reel and add the recording again                                                          |
| The app offers to add a voice               | Click Add a voice, or run `ucut setup --voice`. It downloads about 500 MB once                                                                             |
| The port is already in use                  | Another U-Cut may be open, so close it or use `ucut serve --port 8080`                                                                                     |
| "This Mac is almost out of disk space"      | U-Cut needs at least 1.5 GB free. Clear space, or delete old reels from `~/Movies/U-Cut/renders`                                                           |
| The Mac app says the engine isn't installed | Download the app again. If you built it yourself, run the install command again                                                                            |
| macOS says the app can't be opened          | Approve it once in System Settings, as [Open it the first time](#open-it-the-first-time) shows                                                             |
| The app says it couldn't set itself up      | The message says why, usually disk space. Free some up, then open it again                                                                                 |
| A file was skipped                          | U-Cut lists why. Live Photo videos are skipped on purpose, so each moment appears once                                                                     |
| Exports are slow                            | Close other apps. 4K video takes about twice the length of the reel on an 8 GB Mac                                                                         |

Still stuck? [Open an issue](https://github.com/U-Cut/u-cut/issues/new/choose) with the output of `ucut doctor`.
