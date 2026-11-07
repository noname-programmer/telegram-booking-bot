// smoke-test.js — проверка запуска без Serverless, от начала до конца.
// Поднимает поддельный сервер Telegram Bot API, запускает настоящий bot.js
// и проходит запись: /start → услуга → день → время → контакт.
// Затем проверяет, что запись сохранилась в файле базы SQLite.
//
// Запуск: cd standalone && npm install && npm run smoke

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const USER = { id: 42, first_name: 'Smoke', is_bot: false };
const CHAT = { id: 42, type: 'private' };
const dir = mkdtempSync(join(tmpdir(), 'booking-smoke-'));
const DB_PATH = join(dir, 'bot.db');

// --- Поддельный Telegram ---
let updateId = 0;
let messageId = 1000;
const queue = [];          // обновления, которые бот получит через getUpdates
const received = [];       // всё, что бот отправил в Telegram
let waiter = null;         // ждём следующего ответа бота

const pushMessage = (extra) => queue.push({ update_id: ++updateId, message: { message_id: ++messageId, date: 0, chat: CHAT, from: USER, ...extra } });
const pushCallback = (data) => queue.push({ update_id: ++updateId, callback_query: { id: String(updateId), from: USER, data, message: { message_id: 1, chat: CHAT, date: 0 } } });

const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const method = req.url.split('/').pop();
  const params = raw ? JSON.parse(raw) : {};
  const reply = (result) => res.end(JSON.stringify({ ok: true, result }));

  if (method === 'getMe') return reply({ id: 1, is_bot: true, username: 'smoke_test_bot', first_name: 'Smoke Bot' });
  if (method === 'getWebhookInfo') return reply({ url: '', pending_update_count: 0 });
  if (method === 'getUpdates') {
    const pending = queue.filter((u) => u.update_id >= (params.offset ?? 0));
    if (pending.length) return reply(pending);
    return setTimeout(() => reply([]), 50); // имитация long polling
  }
  received.push({ method, params });
  if (waiter) { waiter(); waiter = null; }
  if (method === 'sendMessage') return reply({ message_id: ++messageId, chat: CHAT, date: 0, text: params.text });
  return reply(true);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;

// --- Настоящий бот ---
const bot = spawn(process.execPath, ['--import', './register.js', 'bot.js'], {
  env: { ...process.env, BOT_TOKEN: 'TEST', TELEGRAM_API_URL: API, DB_PATH },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
bot.stdout.on('data', (d) => { log += d; });
bot.stderr.on('data', (d) => { log += d; });

// Ждём, пока бот отправит ответ с нужным методом.
async function expect(method, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = received.findIndex((c) => c.method === method);
    if (found >= 0) return received.splice(0, found + 1).at(-1);
    if (Date.now() > deadline) throw new Error(`Бот не вызвал ${method}. Лог бота:\n${log}`);
    await new Promise((r) => { waiter = r; setTimeout(r, 200); });
  }
}
const buttons = (c) => c.params.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);

let ok = false;
try {
  pushMessage({ text: '/start' });
  const menu = await expect('sendMessage');
  assert.ok(buttons(menu).includes('book'));
  console.log('✅ /start → меню');

  pushCallback('book');
  const services = await expect('editMessageText');
  const svc = buttons(services).find((d) => d.startsWith('svc:'));
  console.log(`✅ Записаться → услуги (${svc})`);

  pushCallback(svc);
  const days = await expect('editMessageText');
  const day = buttons(days).filter((d) => d.startsWith('day:'))[1];
  console.log(`✅ Услуга → дни (${day})`);

  pushCallback(day);
  const times = await expect('editMessageText');
  const time = buttons(times).find((d) => d.startsWith('time:'));
  console.log(`✅ День → время (${time})`);

  pushCallback(time);
  const ask = await expect('sendMessage');
  assert.equal(ask.params.reply_markup.keyboard[0][0].request_contact, true);
  console.log('✅ Время → просьба отправить номер');

  pushMessage({ contact: { phone_number: '+998901234567', first_name: 'Smoke', user_id: USER.id } });
  const done = await expect('sendMessage');
  assert.match(done.params.text, /Вы записаны/);
  console.log('✅ Контакт → «Вы записаны!»');

  // Даём боту закончить и проверяем файл базы с диска.
  await new Promise((r) => setTimeout(r, 300));
  const row = new Database(DB_PATH, { readonly: true }).prepare('SELECT * FROM bookings').get();
  assert.equal(row.phone, '+998901234567');
  assert.equal(row.status, 'active');
  console.log(`✅ Запись сохранена в SQLite: ${row.date} ${row.time}, ${row.phone}`);
  ok = true;
} finally {
  bot.kill('SIGTERM');
  server.close();
  rmSync(dir, { recursive: true, force: true });
  console.log(ok ? '\n🎉 Запуск без Serverless работает' : `\n❌ Ошибка. Лог бота:\n${log}`);
  process.exit(ok ? 0 : 1);
}
