// sdk.js — замена платформенного `sdk` для запуска на обычном Node.js.
// Предоставляет то же, что и Telegram Serverless:
//   db  — база SQLite в файле (через Drizzle ORM)
//   api — Telegram Bot API (api.sendMessage({...}) и любые другие методы)
//   fetch, InputFile, BotApiError, EndpointError

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- База данных ---

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('./data/bot.db', import.meta.url));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
// Создаём таблицы, если их ещё нет (повторный запуск ничего не ломает).
sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

export const db = drizzle(sqlite);

// --- Telegram Bot API ---

const TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';

export class BotApiError extends Error {
  constructor(method, code, description, parameters = {}) {
    super(`api.${method} failed [${code}]: ${description}`);
    Object.assign(this, { name: 'BotApiError', method, code, description, parameters });
  }
}

export class EndpointError extends Error {
  constructor(description, parameters = {}) {
    super(description);
    Object.assign(this, { name: 'EndpointError', description, parameters });
  }
}

// Файл для отправки: new InputFile(bytes, 'photo.jpg', 'image/jpeg')
export class InputFile {
  constructor(bytes, name = 'file', type = 'application/octet-stream') {
    Object.assign(this, { bytes, name, type });
  }
}

function buildBody(params) {
  const hasFile = Object.values(params).some((v) => v instanceof InputFile);
  if (!hasFile) {
    return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) };
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (value instanceof InputFile) form.append(key, new Blob([value.bytes], { type: value.type }), value.name);
    else form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return { body: form };
}

async function callApi(method, params = {}) {
  if (!TOKEN) throw new Error('Не задан BOT_TOKEN — укажите его в файле standalone/.env');
  const res = await globalThis.fetch(`${API_URL}/bot${TOKEN}/${method}`, { method: 'POST', ...buildBody(params) });
  const data = await res.json();
  if (!data.ok) throw new BotApiError(method, data.error_code, data.description, data.parameters);
  return data.result; // как и на платформе — без обёртки { ok, result }
}

// api.<любой метод>(params) → вызов Bot API. Как на платформе, новые методы работают сразу.
export const api = new Proxy({}, {
  get: (_, method) => (typeof method === 'string' && method !== 'then'
    ? (params) => callApi(method, params)
    : undefined),
});

export const fetch = globalThis.fetch;
