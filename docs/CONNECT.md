# Connect your assistant and your services

U-Cut does everything on your Mac by itself, for free. This guide is for when you want more: an assistant that makes reels for you, or a service you already use for writing, voices or listening.

Nothing here is needed, and nothing changes until you choose it.

## Your assistant

Claude Code, Claude Desktop, Cursor and any other app that speaks the Model Context Protocol (MCP) can make reels with U-Cut. They get tools to read and sort your media, plan a reel, change the plan, render it, study a reel you like, make a demo from a screen recording, and write a reel from a script.

The assistant uses its own plan, in its own app. U-Cut never logs in to it, starts it, or reads its keys.

### Claude Code

The plugin adds the tools, plus a skill and three commands: `/u-cut:reel`, `/u-cut:demo` and `/u-cut:write`.

```
/plugin marketplace add mayank29deo/U-Cut
/plugin install u-cut@u-cut
```

Or add only the tools:

```bash
claude mcp add --scope user u-cut -- ucut mcp
```

Then ask for what you want, for example: "Make a hype reel from ~/Pictures/Goa with a short script about the trip."

### Claude Desktop, Cursor and other assistants

Add this to the app's MCP settings. In Claude Desktop that's Settings, Developer, Edit Config.

```json
{ "mcpServers": { "u-cut": { "command": "/Users/you/.local/bin/ucut", "args": ["mcp"] } } }
```

Use the full path, because these apps don't read your shell's settings. **Connections** in U-Cut shows these lines with your own path filled in, ready to copy. If the file already has other servers, add `"u-cut"` inside its `mcpServers` rather than replacing them, then quit and reopen the app.

### Work on the reel you have open

In U-Cut, open **Connections** and press **Give this reel to your assistant**. Copy the message it shows into your assistant.

- The assistant reads your reel with `app_reel`.
- It sends changes with `app_change`: new lines for a written reel, a title, a vibe, a length or a shape.
- Each change appears in your window straight away as one edit, so **Undo** takes it back.
- The link only works on this Mac, and ends after a day or when U-Cut restarts.

### Going further with HyperFrames

U-Cut renders with [HyperFrames](https://hyperframes.heygen.com), and every reel's job folder holds a HyperFrames project in `project/`. With the HyperFrames skills installed in Claude Code, an assistant can add motion, effects or blocks that U-Cut's styles don't have. It then renders with `render` and `project: true`, or `ucut render <job> --project`. U-Cut still balances the sound and checks the file.

## Your services

Open **Connections** in the app, or use `ucut connections` in Terminal. Each job has a built-in way that runs on this Mac, and the services that can do it instead:

| Job                  | Built in, on this Mac | You can connect                            |
| -------------------- | --------------------- | ------------------------------------------ |
| Write scripts        | U-Cut's own patterns  | Claude                                     |
| Read aloud           | Kokoro                | Voice Studio, ElevenLabs, Deepgram         |
| Listen to recordings | Whisper               | Voice Studio, Deepgram, ElevenLabs, OpenAI |

**Read aloud** is for reels made from words. Demos keep the recording's own sound, so they aren't read aloud. **Listen** is for screen recordings, where it turns what's said into captions.

Choosing a service shows, in one sentence, what goes to it, for example "Your script's words go to ElevenLabs to be read aloud." Your photos never go anywhere.

### Add a key

Press a service's name, paste its key and press **Connect**. U-Cut checks the key with the service first, so a typo fails straight away. In Terminal:

```bash
ucut connect elevenlabs --use voice        # paste the key when asked
ucut connect claude --use write
ucut connections --listen deepgram
ucut connections                           # see what's set up
ucut disconnect elevenlabs
```

Keys go in your Mac's Keychain, under "U-Cut". Like any Keychain item, programs running as you can read them, so only connect keys on a Mac you trust. On Linux and in Docker they go in a file in U-Cut's folder that only you can read. The app only ever sees the last four characters.

Where to get a key:

- **Claude:** [console.anthropic.com](https://console.anthropic.com/settings/keys). Scripts use Claude Opus 5.5 at low effort, which comes to about a cent a script.
- **ElevenLabs:** [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys).
- **Deepgram:** [console.deepgram.com](https://console.deepgram.com/).
- **OpenAI:** [platform.openai.com](https://platform.openai.com/api-keys). Used only for listening, with OpenAI's Whisper model.

### Voice Studio

[Voice Studio](https://voicestudio.sh) is a free app that makes voices on your Mac, including a clone of your own. Choose it in Connections. If it's installed, U-Cut asks once before using it: press **Allow and use Voice Studio**, and U-Cut uses its voices and its listening. If it isn't installed, Connections links to it. It runs on this Mac, so nothing leaves it. If it isn't open, **Open Voice Studio** starts it. Its first start can take a while as it sets up its models, so press **Check again** once it's ready. Voice Studio is free, but some of its voice models have their own licences, so check a model's terms before using a voice commercially.

U-Cut talks to it on `localhost:3900`. If yours uses another port, set `UCUT_VOICESTUDIO_URL`.

### Sharing one Mac

When U-Cut is shared with `ucut serve --lan`, only the person at the Mac can change connections. Everyone else gets the built-in ways, so nobody else spends your credits.

## If something goes wrong

- **"didn't accept the key":** copy the key again and paste only the key.
- **"isn't answering":** for Voice Studio, open it. For a cloud service, check your internet connection.
- **Claude didn't write the script:** U-Cut's own script stays in place, so the reel still works. The notice says why.
- **A voice fails:** choose another voice, or switch Read aloud back to **This Mac**.

[ADR 0021](decisions/0021-connections-are-opt-in-and-stay-on-this-mac.md), [ADR 0022](decisions/0022-assistants-connect-through-mcp.md) and [ADR 0023](decisions/0023-voice-studio-is-used-only-where-installed.md) explain the decisions behind this.
