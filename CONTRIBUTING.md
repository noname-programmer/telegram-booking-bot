# Contributing

Thanks for your interest! Bug reports, ideas and pull requests are welcome.

## Reporting a bug or suggesting a feature

[Open an issue](https://github.com/noname-programmer/telegram-booking-bot/issues/new/choose) and pick a template.
For security issues, see [SECURITY.md](SECURITY.md) instead.

## Making a change

1. Fork the repository and create a branch: `git checkout -b my-change`.
2. Install dependencies:
   ```bash
   npm install
   (cd test && npm install)
   (cd standalone && npm install)
   ```
3. Make your change. Read [AGENTS.md](AGENTS.md) first: it lists the rules of the platform and of this project
   (for example, business-specific wording belongs only in `tgcloud/lib/config.js`).
4. Run all checks:
   ```bash
   npm run lint
   cd test && npm test
   cd ../standalone && npm run smoke
   ```
5. Add a scenario to `test/run.js` for new behavior, and a line to `CHANGELOG.md` under **Unreleased**.
6. Open a pull request and fill in the template.

## Project rules in short

- Handlers stay thin: database code goes in `lib/bookings.js`, texts and keyboards in `lib/ui.js`.
- If you change `tgcloud/schema.js`, update `standalone/schema.sql` too (the tests check this).
- If you add a handler, register it in `HANDLERS` in `standalone/bot.js`.
- Never commit tokens. They belong in `.env` (ignored by git) or in the `tgcloud` CLI state.
