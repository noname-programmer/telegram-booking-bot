# Instructions for Claude

@AGENTS.md

## About the owner

- The owner, Nizomiddin Nazarov, is **not a programmer**. He builds bots with AI and wants to understand
  what the code does without writing it himself.
- Always answer in **Russian**, in plain words. Explain programming terms the first time you use them.
- When you change code, say briefly what changed and why in everyday language. If the change touches code
  quoted in `docs/LEARN.md`, update that file too.
- Ask before doing anything outward-facing (deploying a bot, messaging users) unless he already asked for it.

## Secrets

- **Never ask for a token in the chat.** Tokens live in the cloud environment's variables:
  - `TGCLOUD_TOKEN`: Serverless CLI token of the demo bot @schedule_mkapp (the `tgcloud` CLI reads it natively).
  - `TGCLOUD_TOKEN_<CLIENT>`: Serverless CLI token of a client's bot, e.g. `TGCLOUD_TOKEN_TABASSUM`.
  - `BOT_TOKEN`: regular bot token, for the standalone runtime.
- If a needed variable is missing, tell him to add it: session title → cloud environment → Edit → environment
  variables, then start a new session. Never print token values.

## Workflow

- `main` holds the universal demo bot. Never push to `main` directly: create a branch, open a pull request,
  and wait for green CI.
- A client's bot lives on its own branch `client/<slug>` and is never merged into `main`.
- Skills for common tasks: `/new-client`, `/deploy`, `/check`, `/explain`. Subagent: `reviewer`.
