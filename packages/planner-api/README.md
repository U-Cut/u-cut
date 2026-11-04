# @u-cut/planner-api

Writes a reel's script with Claude, using the person's own Anthropic API key. It's the optional "API" lane from [ADR 0008](../../docs/decisions/0008-claude-subscription-stays-with-the-user.md).

- `writeWithClaude` asks `claude-opus-5-5` at low effort for structured lines, through Anthropic's official SDK. It checks them against the same rules as U-Cut's own writer, and paces them with `scriptFrom` from the rules planner.
- Anything unusable throws a `ClaudeError` with a plain sentence, and the caller keeps the rules' script.
- `checkClaudeKey` checks a key with the cheapest call there is.

It runs only on the server, next to the key, and is used only when someone chooses Claude in Connections. See [ADR 0021](../../docs/decisions/0021-connections-are-opt-in-and-stay-on-this-mac.md).
