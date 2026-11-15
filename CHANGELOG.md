# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `keeper/`: a second, separate bot. It connects through Telegram Business and shows the user messages
  that the other person deleted or edited; Mini App with history, Pro subscription paid in Telegram Stars,
  Russian / Uzbek / English. Scenarios in `test/keeper.js`.
  Deployed to @keepXsavebot; a long edited message no longer exceeds Telegram's 4096-character limit, and a repeated
  "deleted" event no longer notifies twice.
- Keeper Mini App rebuilt: chats grouped by person, a feed, insights (14-day and hour-of-day charts, deletion speed,
  top chats), profile with settings, and an admin panel for `ADMIN_IDS` (numbers and users only, gift or remove Pro).
- Keeper: quiet mode and per-chat mute (events are collected in the Mini App without messages in the chat);
  more data per message (sender, file size and duration, forward origin, edit history with times); `chats` table
  with lifetime counters.
- Keeper: quiet by default — nothing is sent to the chat; photos, videos and voice messages open inside the Mini App
  (`media` endpoint). Notification modes: quiet / short / once a day / full, plus "favourites only".
- Keeper: owner with permanent VIP (`OWNER_ID`), VIP for trusted people (admin panel or `/vip <id>`), a 3-day Pro
  trial, invite links (+7 days of Pro), Pro payment inside the Mini App, text search, export of a conversation
  to a file, admin broadcast and a start → connect → pay funnel.
- Keeper Mini App: light / dark / Telegram theme, full-screen photo and video viewer with pinch zoom, edit history as a
  timeline with word-level highlighting, file cards for documents. A file replaced by an edit is kept
  (`edits.old_file_id`). The `media` endpoint reads files as a stream with a size cap. "Deleted" time can no longer be
  earlier than "sent".
- Claude setup: `CLAUDE.md`, `.claude/settings.json` (safe command permissions, dependency install on session start),
  skills `/new-client`, `/deploy`, `/check`, `/explain`, a `reviewer` subagent, and `docs/CLAUDE-GUIDE.md`.
- English README (Russian version moved to `README.ru.md`).
- ESLint with a CI job (`npm run lint`).
- Issue and pull request templates, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, Dependabot.
- `docs/LEARN.md`: a plain-language walkthrough of how the bot works.

### Changed
- Demo bot: the owner is now an admin (`ADMIN_IDS` in `tgcloud/lib/config.js`).
- Dependencies: better-sqlite3 13, drizzle-orm 0.45 (`standalone/`, `test/`), globals 17,
  GitHub Actions `checkout` and `setup-node` v7.
- `Dockerfile` is now two-stage: better-sqlite3 13 compiles from source, so build tools live only in the
  first stage and the final image stays slim.

## [0.3.0] - 2026-11-07

### Added
- Running without Telegram Serverless: `standalone/` (Node.js, SQLite, long polling), with the same handlers.
- `Dockerfile` and `docker-compose.yml`.
- End-to-end smoke test against a fake Telegram server.
- Test that `standalone/schema.sql` matches `tgcloud/schema.js`.

## [0.2.0] - 2026-11-07

### Changed
- The bot is now business-agnostic: all wording moved to `TEXTS` in `config.js`.
- Prices can be free (`0`) or hidden (`null`); numbers use non-breaking spaces.

### Added
- Ready configs in `examples/`: barbershop, clinic, car wash, tutor.
- Tests run on every config; GitHub Actions CI.

## [0.1.0] - 2026-11-07

### Added
- Booking flow: service → day → time → phone number.
- "My bookings" with cancellation; admin panel with day view, cancellation and reminders.
- Double-booking protection (pre-check + partial unique index).
- Deployment to Telegram Serverless.

[Unreleased]: https://github.com/noname-programmer/telegram-booking-bot/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/noname-programmer/telegram-booking-bot/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/noname-programmer/telegram-booking-bot/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/noname-programmer/telegram-booking-bot/releases/tag/v0.1.0
