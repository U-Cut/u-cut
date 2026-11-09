# 0022. Assistants connect to U-Cut through an MCP server and a Claude Code plugin

Status: accepted

## Context

The brief's plugin lane says a Claude subscriber runs U-Cut's plugin in their own Claude Code, which drives `ucut` on a job folder, and that the app never drives `claude` for them ([ADR 0008](0008-claude-subscription-stays-with-the-user.md)). The owner also wants any assistant to be able to make reels with U-Cut, using HyperFrames as the engine underneath.

## Decision

**`ucut mcp` is a Model Context Protocol server** on standard input and output. Claude Code, Claude Desktop, Cursor and any other MCP client can start it. Its tools make reels end to end:

- read and sort media;
- plan a reel and return the plan;
- save an edited plan, checked against the schema;
- render a job;
- study a reel;
- read a screen recording;
- make a demo;
- write a reel from lines the assistant wrote itself, or from a sentence;
- voice a line.

It also lists the templates, vibes, scenes and voices.

It is written against the protocol directly, with no SDK. The part U-Cut needs is `initialize`, `tools/list`, `tools/call`, `ping` and progress notifications. Owning about two hundred lines beats a dependency tree for a feature that must start fast and never print to standard output. Protocol versions from 2024-11-05 onwards are accepted.

**The assistant writes, U-Cut renders.** An assistant changes what a reel says and does: lines, titles, order, shots, vibe and length. U-Cut's planner, composer and HyperFrames keep the timing, the beat and the output spec correct. For anything beyond U-Cut's styles, every job has a HyperFrames `project/` folder. An assistant with the HyperFrames skills can edit it, and `ucut render <job> --project` renders that folder and masters the sound.

**The project is the assistant's to edit, and is never overwritten by surprise.** `plan_reel` writes `project/` straight away, in a job folder of its own. U-Cut fingerprints what it wrote. Rendering from the plan refuses to replace a project someone has edited unless they pass `force`, and `project: true` renders the edits as they stand.

**Heavy work takes turns.** Plans, listening and renders from one `ucut mcp` run one at a time. A cancelled request stops what it started, and progress only ever goes up, as the protocol requires.

**The plugin** in `plugin/` bundles the server, a skill that teaches the workflow, and three commands. The repo is also a plugin marketplace, so `/plugin marketplace add U-Cut/u-cut` then `/plugin install u-cut@u-cut` sets it up.

**Handing an open reel to an assistant.** In the app, "Give this reel to your assistant" makes a one-time link for that reel and shows a prompt to paste. The assistant passes the link to `ucut mcp`, which talks to the running app over `localhost`:

- It can read that reel.
- It can send it changes: new lines, a title, a vibe, a length, a shape.
- The changes land in the open window as one undoable edit.
- The open reel answers each change, so `app_change` reports it applied only when it was, and says so when a different reel is open.

The link reaches only that reel. It works only from this Mac, and it ends when U-Cut restarts. The app never starts an assistant or reads its credentials. Assistants such as Claude Desktop start servers without the shell's PATH, so the installed `ucut` carries the paths it needs, and the app's setup lines use its full path.

## Consequences

- **A subscriber gets better scripts with no extra credits.** They use their own Claude Code, which is what ADR 0008 allows.
- **Other assistants get the same tools.**
- **The cost is a stable tool surface.** Tool names and arguments become a public interface, so changes to them need the same care as the CLI.
