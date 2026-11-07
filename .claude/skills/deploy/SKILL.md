---
name: deploy
description: Deploy the bot to Telegram Serverless (the demo bot, or a client's bot by slug).
argument-hint: "[client slug, empty = demo bot]"
disable-model-invocation: true
---

# Deploy to Telegram Serverless

`$ARGUMENTS` is a client slug (e.g. `tabassum`) or empty for the demo bot @schedule_mkapp.

## 1. Pick the bot and the code

- Demo bot: branch `main`, token variable `TGCLOUD_TOKEN`.
- Client: branch `client/<slug>`, token variable `TGCLOUD_TOKEN_<SLUG>` (uppercase).

Check the variable exists with `test -n "$VAR" && echo set || echo missing` (never print its value).
If it is missing, stop and tell the owner in Russian how to add it: session title → cloud environment → Edit →
environment variables → `NAME=token`, then start a new session. Never ask for the token in chat.

Check out the branch and make sure it is up to date with GitHub.

## 2. Check before deploying

Run `npm run lint` and `cd test && npm test`. Do not deploy if anything fails.

## 3. Deploy

Run each command with the token in the environment, e.g. `TGCLOUD_TOKEN="$TGCLOUD_TOKEN_TABASSUM" npx tgcloud push`.

1. `npx tgcloud fetch` (sync the CLI's local record with the cloud), then `npx tgcloud status`.
2. `npx tgcloud push`.
3. If the push reports schema changes: `npx tgcloud migrate --dry-run`, then `npx tgcloud migrate --safe`.
   If there are **warning** changes (drops) or **manual** ones, stop and explain them to the owner before doing anything.
4. `npx tgcloud webhook` must say it is in sync; otherwise run `npx tgcloud webhook sync`.

## 4. Verify and report

- Get the bot's username via a temporary endpoint run if needed, or ask the owner to open the bot.
- `npx tgcloud run handlers/message '{ message_id: 1, chat: { id: 1, type: "private" }, from: { id: 1, first_name: "T" }, text: "/start" }'`
  is expected to end with `chat not found`: that means the code loaded and ran up to the Telegram call.
- Tell the owner in Russian: what was deployed, that checks passed, and to send `/start` to the bot.
  For a new client, remind him to send `/myid` and add the ID to `ADMIN_IDS`, then deploy again.
