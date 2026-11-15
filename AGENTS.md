# AGENTS.md

Orientation for AI coding assistants (and humans) working in this project.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it short
and true. For the full SDK reference (db, Bot API, fetch), see
[docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).

## What this project is

A **Telegram Mini App bot** running on Telegram's serverless platform. You write
JavaScript modules (database schema, shared library code, update handlers); the
platform runs them in a V8 isolate. The `tgcloud` CLI syncs this local project
with the bot's cloud environment — think `wrangler`/`vercel` + `drizzle-kit`.

There is no server to run locally and no `node_modules` to import from at runtime:
the only things available inside a module are the platform SDK and other modules
in this project.

## Layout

Everything the platform runs lives in the **`tgcloud/`** folder. The rest of the
project root is yours (a mini-app front-end, config, docs).

| Path                  | What it is                                                        |
|-----------------------|-------------------------------------------------------------------|
| `tgcloud/schema.js`   | Database schema — tables as **named exports**. One file.          |
| `tgcloud/lib/`        | Shared modules. Subdirectories allowed (`lib/internal/util.js`).  |
| `tgcloud/handlers/`   | Update handlers, **one level only**. Names match Telegram Bot API update types (`message`, `callback_query`, …). |
| `tgcloud/endpoints/`  | Functions the Mini App calls (`POST /api/<name>`), **one level only**. |
| `tgcloud.jsonc`       | Project config. Its `"static"` block names the build folder hosted as the Mini App. |
| `docs/`               | Reference docs (this project's, for you). Not deployed.           |
| `.tgcloud/`           | CLI state (credentials, snapshot, cached layout). **Never edit or read from here** — it's gitignored machine state. |

Only `.js` files under `tgcloud/` (`schema.js`, `lib/`, `handlers/`, `endpoints/`) are deployed
as code, plus — when `tgcloud.jsonc` names one — the front-end's build folder as
the Mini App's static files. Everything else (Markdown, config, `.tgcloud/`, the
front-end's sources) is local-only. Module names are relative to `tgcloud/`: the
file `tgcloud/handlers/message.js` is the module `handlers/message`.

## Mini App front-end

If the project root holds a front-end (Vite, React, Vue, …), its **build output**
is deployed next to the bot and served as the Mini App at
`https://app<app_id>.tgcloud.ai/` — `push` prints the exact URL.

- `tgcloud.jsonc` → `{ "static": { "source": "dist" } }` — `source` names the
  build folder; the other keys of the `static` object are the serving config
  (e.g. `"spa": true` serves `index.html` for unknown extension-less paths —
  client-side routing; `immutable`, `headers`, `redirects`). `tgcloud init` writes
  the file when it recognizes the front-end; after that it's a normal project
  file. JSON with comments and trailing commas (a project may use a strict-JSON
  `tgcloud.json` instead — never both). `"static": "dist"` is accepted as a
  shorthand for `{ "source": "dist" }`.
  `"static": false` removes the deployed site on the next push.
- **Build before you push.** `push` uploads the folder as it is on disk; it never
  runs the build. `npm run deploy` (build + push) is the safe default.
- The front-end is ordinary browser code with npm packages — none of the
  `tgcloud/` module rules apply to it, and `tgcloud/` modules can't import it.
  It talks to the bot's code only through **endpoints** (below).
- The site is served from the host root, so the bundler's default `base` (`/`)
  is right. Don't add `X-Frame-Options` or a restrictive `frame-ancestors`:
  Telegram Web opens Mini Apps in an iframe.

## Endpoints — the Mini App's server side

`tgcloud/endpoints/<name>.js` is called by the Mini App as `POST /api/<name>` on
the same host as the static site. Use it for anything the front-end can't do
itself: the database, the Bot API, secrets.

- `export default async function (input, ctx)` — `input` is the JSON body (an
  object); the return value goes back as JSON.
- `ctx.initData` is the Mini App's init data **verified by the platform** (same
  shape as `Telegram.WebApp.initDataUnsafe`): `ctx.initData.user` is the caller.
  There is no `ctx.user`. Invalid init data → `401`, the endpoint never runs.
- Refuse with `throw new EndpointError('Out of stock', { code: 'OUT_OF_STOCK' })`
  (`import { EndpointError } from 'sdk'`) → `400`, the Mini App gets
  `description` + `parameters`. Any other exception → generic `500`; never
  rely on its message reaching the client.
- Front-end call: `Telegram.WebApp.Serverless.call('<name>', input, (err, result) => …)`
  from the official `telegram-web-app.js` — it sends the init data; `err` has
  `message` (description), `type` (`'ENDPOINT_ERROR'` for your `EndpointError`)
  and `parameters`. Don't hand-roll `fetch` + init data.
- Names: letters, digits, `_`, not starting with a digit (`getProfile`).
  Scaffold with `npx tgcloud add endpoints/<name>`; test with
  `npx tgcloud run endpoints/<name> '{}' --ctx '{ initData: { user: { id: 1 } } }'`.

## Module system — the rules that bite

- **Import project modules by relative path WITH the `.js` extension; import
  the SDK by name.** (from `tgcloud/handlers/message.js`:)
  - ✅ `import { users } from '../schema.js'`
  - ✅ `import { addItem } from '../lib/cart.js'`
  - ✅ `import { db, api, fetch } from 'sdk'` / `import { eq, sql } from 'sdk/db'`
  - ❌ `import { users } from '../schema'` → a relative import must end in `.js`
  - ❌ `import x from '../../src/x.js'` → nothing outside `tgcloud/` is reachable
  - A module's *name* is its path inside `tgcloud/` without `.js` (`lib/cart`);
    `tgcloud run` takes it, and `from 'lib/cart'` (no extension) also resolves —
    but write relative imports.
- **No filesystem, no npm packages** at runtime. Only `sdk` (and its submodules
  like `sdk/db`) and your own project modules exist.
- A handler module's `export default` is what the platform invokes, with the
  update's **payload** as the first argument — for `handlers/message` that's the
  `Message` (i.e. `update.message`), for `handlers/callback_query` the
  `CallbackQuery`, and so on. The full `Update` (with `update_id`) is on the
  second argument: `ctx.update`. An endpoint's `export default` gets
  `(input, ctx)` — see *Endpoints* above.

## Platform SDK (`import … from 'sdk'`)

- **`db`** — the database (query builder + schema DSL). Full API: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
- **`api`** — the Telegram Bot API. `api.<method>({...})` (e.g. `api.sendMessage`,
  `api.getMe`) returns the **unwrapped** result and **throws `BotApiError`** on
  failure (`import { BotApiError } from 'sdk'`; it has `.code`/`.description`/`.parameters`).
- **`fetch`** — outbound HTTP, web-`fetch`-like (`res.status/ok`, `res.json()`,
  `res.text()`, streaming via `for await`, redirects followed).
- **`EndpointError`** — the one way an endpoint refuses a call (see *Endpoints*).

## Database — the rules that bite

Full API in [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md). The non-obvious parts:

- **Every DB call is async — always `await`.** `.all()`, `.get()`, `.values()`,
  `.run()`, `db.$count()` and the raw `db.run/all/get` all return Promises.
- **No foreign keys.** `.references()` and `foreignKey()` **throw at declaration**
  — the runtime runs with FKs off, so they'd be silently inert. Enforce integrity
  in application code (delete children before parents, etc.).
- **Drops happen only via `.deprecated('reason')`** on a column/table/index.
  Deleting the declaration does *not* drop anything.
- **Type changes aren't automatic** — do them by hand with `db.run(...)`.

## Deploy & migrate workflow

**Deploying never touches the database.** Schema sync is a separate, explicit step.

The CLI is a local dev-dependency, so run it with `npx tgcloud <command>` (or use
the `npm run` scripts in package.json — e.g. `npm run deploy`):

```
npx tgcloud status     # what changed locally vs the cloud
npx tgcloud push       # deploy modules (and the static build) to the cloud
npx tgcloud migrate    # apply tgcloud/schema.js changes to the database (interactive)
npx tgcloud run <module> [args]   # execute a handler or endpoint server-side
npx tgcloud pull       # bring the local project in line with the cloud
npx tgcloud login      # link this project to a bot
npx tgcloud webhook    # show the bot's webhook and whether it matches your handlers
```

After you change `tgcloud/schema.js`, `push` reports what the DB *would* change but applies
nothing — run `npx tgcloud migrate` to actually apply it.

The platform manages the bot's webhook for you, derived from your deployed
`handlers/*`, and refreshes it on `push`. If it ever drifts — e.g. someone called
`setWebhook` with the raw bot token — `npx tgcloud webhook` shows the mismatch and
`npx tgcloud webhook sync` repairs it.

## This project: universal booking bot (project-specific notes)

- The bot is business-agnostic. Business settings (name, services, prices, hours, admins, wording in `TEXTS`)
  live ONLY in `tgcloud/lib/config.js`. Never hard-code business-specific words in handlers or ui.js.
- `examples/*.js` are ready configs for different businesses; keep them in the same shape as `config.js`.
- `price`: number → formatted sum, `0` → «бесплатно», `null` → hidden.
- DB access goes through `tgcloud/lib/bookings.js`; texts/keyboards through `tgcloud/lib/ui.js`.
  Handlers stay thin. The callback_data format is documented at the top of `lib/ui.js` (64-byte limit).
- Dates are stored as `'YYYY-MM-DD'` text and times as `'HH:MM'` in the business timezone (`SCHEDULE.utcOffsetHours`).
- The platform has no cron, so reminders are sent manually from the admin panel.
- All user-facing text is Russian and uses `parse_mode: 'HTML'`. Escape user data with `esc()`.
- Run `npm run lint` (ESLint, root) and `npm test` after every change. Keep `CHANGELOG.md` (Unreleased) updated.
- Docs: `README.md` is English, `README.ru.md` is Russian; keep both in sync. `docs/LEARN.md` explains the code
  to a non-programmer owner and quotes real code: update it when the quoted code changes.
- Run `npm test` after every change. It runs every scenario in `test/run.js` against `config.js` and each
  example config, with a mocked `sdk` (see `test/mock/`, `test/loader.js`). Tests must not depend on concrete
  config values. Add a scenario for every new feature.
- The same handlers also run WITHOUT Serverless via `standalone/` (Node.js + better-sqlite3 + long polling):
  `standalone/sdk.js` re-implements `db`/`api` and `standalone/bot.js` dispatches updates to `tgcloud/handlers/`.
  Therefore handlers must only use `sdk` APIs that `standalone/sdk.js` provides. When you add a handler,
  register it in `HANDLERS` in `standalone/bot.js`. When you change `tgcloud/schema.js`, update
  `standalone/schema.sql` too (`npm test` fails if they diverge). `cd standalone && npm run smoke` is the end-to-end check.


## Second bot in this repository: `keeper/`

- `keeper/` is a separate tgcloud project (its own `tgcloud/`, `tgcloud.jsonc`, Mini App in `keeper/miniapp/`), deployed to
  a different bot with the token variable `TGCLOUD_TOKEN_KEEPER`. See `keeper/README.md`.
- **Before any `npx tgcloud` command in `keeper/`, run `mkdir -p keeper/.tgcloud`.** Without that folder the CLI walks up
  and treats the root booking bot as the project, so a push would send the wrong code to the wrong bot.
- It has no standalone runtime and no example configs. Its scenarios are `test/keeper.js` (`cd test && npm run keeper`,
  also part of `npm test`); the test builds tables straight from `keeper/tgcloud/schema.js`.
- All texts live in `keeper/tgcloud/lib/i18n.js` in three languages (ru, uz, en); a test fails if a key is missing in one.
- Mini App endpoints: `chats`, `feed`, `stats`, `settings`, `media`, `sendMedia`, `invoice`, `export`, `pin`, `promo`, `admin`. Each starts with `whoami(ctx, input)` from
  `lib/app.js`; `admin` must call `requireAdmin` and must never return message text. The Mini App is one hand-written file,
  `keeper/miniapp/index.html` (three languages inside, all user text inserted as text, never as HTML).
- Notifications go through `announce()` in `lib/ui.js`. `users.notify` is a mode from `NOTIFY` in `lib/config.js`
  (0 quiet — the default for new users, 1 full, 2 short, 3 one message a day); `chats.muted`, `chats.fav` and
  `users.favOnly` narrow it. Handlers always save and count; `announce()` only decides whether to message the owner.
- Files are never downloaded when a message is saved (only `file_id` is stored). The `media` endpoint is the only place
  that reads file bytes for the Mini App: keep the size check before reading and the capped, chunked streaming loop.
  `sendAsFile()` in `lib/ui.js` downloads (≤ 20 MB) to re-upload a photo or video as a document. Never resize or re-encode.
- `whoami(ctx, input)` also enforces the ban and the PIN (`input.pin`): never read user data in an endpoint before it.
- Payments: invoice payloads are `pro` (monthly subscription), `year` (one-time, 365 days) and `gift:<userId>`;
  `knownPayload()` in `handlers/pre_checkout_query.js` must accept every payload `invoiceLink()` can create.
- Admin = `ADMIN_IDS` (owner) or `users.role = 'admin'` (helper): check with `isAdmin(user)`; owner-only actions
  (VIP, broadcast, settings, roles) use `requireOwner`.
- `PRO`, `REF` and `LIMITS` in `lib/config.js` are defaults: `loadSettings()` (called from `getUser`) overlays values
  from the `settings` table, so read them at call time, never copy them into module-level constants.
- Pro = paid or trial (`users.proUntil`) or VIP (`users.vip`); always check with `isPro(user)`. `OWNER_ID` gets VIP
  automatically in `getUser`. Only admins may grant VIP (`/vip`, `admin` endpoint).
- The schema default of `users.notify` is still 1 (the platform cannot change a column default); `getUser` writes 0.
- It never stores the owner's own messages or protected content, and has no code to capture self-destructing media.
  Keep it that way.
