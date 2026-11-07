-- Таблицы для запуска без Telegram Serverless (на платформе их создаёт `npx tgcloud migrate`).
-- Должны совпадать с tgcloud/schema.js — это проверяет `npm test`.

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  phone       TEXT NOT NULL,
  service_id  TEXT NOT NULL,
  date        TEXT NOT NULL,
  time        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_bookings_slot ON bookings (date, time) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings (date);

CREATE TABLE IF NOT EXISTS drafts (
  user_id    INTEGER PRIMARY KEY,
  service_id TEXT NOT NULL,
  date       TEXT NOT NULL,
  time       TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
