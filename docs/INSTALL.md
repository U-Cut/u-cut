# Installing U-Cut

## The quick way

On a Mac with Apple Silicon, paste this into Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/mayank29deo/U-Cut/main/install.sh | bash
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
| Mac app                | Open U-Cut from `~/Applications`                    |
| Browser                | Run `ucut`, which opens <http://localhost:4173>     |
| Different port         | Run `ucut serve --port 8080`                        |
| One reel, no interface | Run `ucut make <folder> -o reel.mp4`                |
| See how photos sort    | Run `ucut sort <folder>`                            |
| Learn a reel's style   | Run `ucut study reel.mp4`                           |
| Copy that style        | Run `ucut make <folder> --like reel.mp4 -o new.mp4` |

## On Linux or anywhere else

### With Docker

```bash
docker build -t u-cut https://github.com/mayank29deo/U-Cut.git
docker run --rm -p 4173:4173 -v u-cut-data:/data u-cut
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

| What                                    | Where                      |
| --------------------------------------- | -------------------------- |
| Reels, your media and editable projects | `~/Movies/U-Cut`           |
| The code                                | `~/.u-cut`                 |
| The `ucut` command                      | `~/.local/bin/ucut`        |
| The Mac app                             | `~/Applications/U-Cut.app` |
| The rendering browser                   | `~/.cache/hyperframes`     |

Set `UCUT_HOME` to keep reels and media somewhere else, such as an external drive.

Every reel has an editable HyperFrames project in `~/Movies/U-Cut/jobs/<id>/project`.

## Update

Run the install command again. It keeps your reels.

## Uninstall

```bash
rm -rf ~/.u-cut ~/.local/bin/ucut ~/Applications/U-Cut.app
```

To delete your reels and media too, also remove `~/Movies/U-Cut`.

## If something goes wrong

Start with `ucut doctor`. It checks Node, FFmpeg, the rendering browser and disk space.

| Problem                                     | Fix                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Rendering browser: Not installed`          | Run `ucut setup`                                                                                 |
| The app says captions need the speech model | Run `ucut setup --speech`, then add the recording again                                          |
| The port is already in use                  | Another U-Cut may be open, so close it or use `ucut serve --port 8080`                           |
| "This Mac is almost out of disk space"      | U-Cut needs at least 1.5 GB free. Clear space, or delete old reels from `~/Movies/U-Cut/renders` |
| The Mac app says the engine isn't installed | Run the install command again                                                                    |
| macOS says the app can't be opened          | Right-click it, then choose Open. U-Cut isn't notarized yet                                      |
| A file was skipped                          | U-Cut lists why. Live Photo videos are skipped on purpose, so each moment appears once           |
| Exports are slow                            | Close other apps. 4K video takes about twice the length of the reel on an 8 GB Mac               |

Still stuck? [Open an issue](https://github.com/mayank29deo/U-Cut/issues/new/choose) with the output of `ucut doctor`.
