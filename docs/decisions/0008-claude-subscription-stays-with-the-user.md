# 0008. A Claude subscription is used only inside the user's own Claude Code

Status: accepted

## Context

The owner wants U-Cut to need no AI credits beyond a Claude subscription. We re-read the Agent SDK docs in October 2026. The rule quoted in the brief is still there word for word: third parties may not offer claude.ai login or rate limits for their products unless previously approved. The same page forbids naming a product "Claude Code" or imitating its visuals.

## Decision

The three lanes from the brief stand:

- **Rules:** free, default, no account of any kind.
- **Plugin:** a subscriber runs U-Cut's plugin themselves in Claude Code. The plugin drives the `ucut` CLI on a job folder, and the app only prepares that folder and a prompt to paste. This is how "just my Claude subscription" is delivered.
- **API key:** optional, pay-as-you-go, off by default.

The app never spawns `claude`, reads its credentials, or offers a Claude login.

In code the lanes are named `rules`, `plugin` and `api`. The user-facing name of the plugin lane must not be "Claude Code".

## Consequences

Someone with a subscription gets the richest result from Claude Code, not from inside the Mac app. People with no Claude account still get a finished reel from the rules lane, so the free path has to be good on its own.
