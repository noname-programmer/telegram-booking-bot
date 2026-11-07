# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.
Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository.

You'll get a reply within 7 days.

## Tokens and secrets

- The bot token (`BOT_TOKEN`) and the Serverless CLI token give full control of the bot.
  Keep them in `standalone/.env` or in the `tgcloud` CLI state. Both are ignored by git.
- If a token has leaked, regenerate it right away in [@BotFather](https://t.me/BotFather):
  - bot token: `/mybots` → your bot → **API Token** → **Revoke**
  - Serverless CLI token: your bot → **Serverless** → **CLI Access**
