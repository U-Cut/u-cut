# The U-Cut plugin

Lets Claude Code make reels and demos with U-Cut, using your own Claude plan in your own terminal. It bundles:

- U-Cut's MCP server (`ucut mcp`), which gives Claude tools to read media, plan, render, study a reel, make demos and write reels.
- A skill that teaches the workflow.
- Three commands: `/u-cut:reel`, `/u-cut:demo` and `/u-cut:write`.

## Install

Install U-Cut first, so the `ucut` command exists. Then, in Claude Code:

```
/plugin marketplace add U-Cut/u-cut
/plugin install u-cut@u-cut
```

Or add only the tools, without the skill and commands:

```bash
claude mcp add --scope user u-cut -- ucut mcp
```

## Other assistants

Any app that speaks the Model Context Protocol, such as Claude Desktop or Cursor, can use the same server. Add this to its MCP settings:

```json
{ "mcpServers": { "u-cut": { "command": "/Users/you/.local/bin/ucut", "args": ["mcp"] } } }
```

Use the full path to `ucut`, since these apps don't read your shell's PATH. U-Cut's Connections sheet shows it filled in.

## Work on a reel you have open

In the U-Cut app, open **Connections** and press **Give this reel to your assistant**. Paste the message it gives you into your assistant. The assistant reads the reel with `app_reel` and sends changes with `app_change`, and each change appears in your window as one edit you can undo. The link only works on your Mac, and only for a day.

U-Cut never starts an assistant, logs in to one or reads its keys. See [ADR 0008](../docs/decisions/0008-claude-subscription-stays-with-the-user.md) and [ADR 0022](../docs/decisions/0022-assistants-connect-through-mcp.md).
