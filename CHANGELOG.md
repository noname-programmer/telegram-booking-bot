# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Claude setup: `CLAUDE.md`, `.claude/settings.json` (safe command permissions, dependency install on session start),
  skills `/new-client`, `/deploy`, `/check`, `/explain`, a `reviewer` subagent, and `docs/CLAUDE-GUIDE.md`.
- English README (Russian version moved to `README.ru.md`).
- ESLint with a CI job (`npm run lint`).
- Issue and pull request templates, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, Dependabot.
- `docs/LEARN.md`: a plain-language walkthrough of how the bot works.

### Changed
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
