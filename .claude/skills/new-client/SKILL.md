---
name: new-client
description: Set up the booking bot for a new client's business (name, services, prices, hours, admins). Use when the owner says he has a new client, wants a bot for a specific business, or asks to adapt the bot to a salon, clinic, car wash, school, etc.
argument-hint: "[short description of the business]"
---

# New client bot

Goal: a working bot for one client, on its own branch, without touching the demo on `main`.

## 1. Collect the details

Use whatever the owner already wrote (including `$ARGUMENTS`). Ask in **one** message, in Russian, only for what is missing:

- type of business and its name;
- address, phone, map link (optional);
- services: title and price for each (price `0` = «бесплатно», no price = hide it);
- working hours, days off, slot length (30 or 60 minutes), how many days ahead clients can book;
- Telegram IDs of the admins (if unknown: they send `/myid` to the bot after the first deploy);
- where it will run: Telegram Serverless (client's bot has Serverless enabled) or the client's own server.

Suggest sensible defaults instead of asking about everything (e.g. 60-minute slots, 7 days ahead, Sunday off).

## 2. Make the config

1. `git checkout main && git pull`, then `git checkout -b client/<slug>` (slug: short latin name, e.g. `tabassum`).
2. Start from the closest file in `examples/` and write `tgcloud/lib/config.js` in exactly the same shape.
   Fill `TEXTS` with wording that fits the business (icon, welcome, chooseService, contactReason, booked).
   Service `id`s: short latin words, unique.
3. Change nothing outside `config.js` unless the client needs a feature the bot doesn't have. In that case stop
   and explain to the owner what would need to change.

## 3. Check

Run `npm run lint` and `cd test && npm test`. Both must pass. Fix and re-run if not.

## 4. Save and report

1. Commit on `client/<slug>` and push the branch. Do **not** open a pull request into `main`:
   client branches are never merged.
2. Tell the owner, in Russian and in plain words:
   - what the bot will show (services with prices, hours);
   - that it is saved on branch `client/<slug>`;
   - the next step: `/deploy <slug>`. For that the client's Serverless CLI token must be saved in the environment
     as `TGCLOUD_TOKEN_<SLUG>` (uppercase). Never ask for the token in chat.
