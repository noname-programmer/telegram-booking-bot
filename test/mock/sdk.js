// Заглушка `sdk`: база — SQLite в памяти, Bot API — записывает вызовы.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export const sqlite = new Database(':memory:');
export const db = drizzle(sqlite);

export class BotApiError extends Error {
  constructor(method, code, description) {
    super(description);
    Object.assign(this, { method, code, description, parameters: {} });
  }
}
export class EndpointError extends Error {}
export class InputFile {}
export const fetch = () => { throw new Error('fetch не нужен в тестах'); };

export const calls = [];
let nextMessageId = 100;
// Правило для эмуляции ошибок: (method, params) => BotApiError | undefined
export const failures = { rule: null };

export const api = new Proxy({}, {
  get: (_, method) => async (params = {}) => {
    calls.push({ method, params });
    const err = failures.rule?.(method, params);
    if (err) throw err;
    if (method === 'sendMessage') return { message_id: nextMessageId++, chat: { id: params.chat_id } };
    return true;
  },
});
