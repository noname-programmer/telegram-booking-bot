// Локальная проверка бота без Telegram и без деплоя.
// Запуск: cd test && npm install && npm test
//
// Мы вызываем обработчики так же, как это делает платформа, — передаём им
// Message или CallbackQuery — и проверяем, что бот отправил в ответ.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../tgcloud/schema.js';
import { sqlite, calls, failures, BotApiError } from 'sdk';
import { ADMIN_IDS, BUSINESS, SERVICES, SCHEDULE } from '../tgcloud/lib/config.js';
import { upcomingDays } from '../tgcloud/lib/time.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';

// Таблицы берём из standalone/schema.sql — того же файла, что использует запуск без Serverless.
// (На платформе их создаёт `npx tgcloud migrate` из tgcloud/schema.js; совпадение проверяется ниже.)
sqlite.exec(readFileSync(new URL('../standalone/schema.sql', import.meta.url), 'utf8'));

const ADMIN = 999;
const ALICE = 1;
const BOB = 2;
ADMIN_IDS.push(ADMIN);

const DAY = upcomingDays()[1]; // следующий рабочий день — все слоты гарантированно в будущем
const PACKED = DAY.replaceAll('-', '');
const S1 = SERVICES[0].id;
const S2 = SERVICES[1].id;
// Все слоты дня по настройкам: ['10:00', '11:00', ...]
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const SLOTS = [];
for (let m = toMin(SCHEDULE.open); m <= toMin(SCHEDULE.close) - SCHEDULE.slotMinutes; m += SCHEDULE.slotMinutes) SLOTS.push(fmt(m));
const P = (t) => t.replace(':', '');
console.log(`Конфигурация: ${BUSINESS.name} · услуг: ${SERVICES.length} · слотов в день: ${SLOTS.length}\n`);

// --- помощники ---
const user = (id) => ({ id, first_name: `User${id}`, is_bot: false });
const msg = (id, extra) => onMessage({
  message_id: 1, chat: { id, type: 'private' }, from: user(id), date: 0, ...extra,
});
let qid = 0;
const press = (id, data) => onCallback({
  id: String(++qid), from: user(id), data,
  message: { message_id: 50, chat: { id, type: 'private' } },
});
const take = () => calls.splice(0);
const sent = (list, method) => list.filter((c) => c.method === method);
const buttons = (c) => (c.params.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);
const toast = (list) => sent(list, 'answerCallbackQuery').at(-1)?.params.text;

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    console.log(`❌ ${name}`);
    throw e;
  }
}

// --- сценарии ---

await step('standalone/schema.sql совпадает с tgcloud/schema.js', async () => {
  for (const table of Object.values(schema)) {
    const cfg = getTableConfig(table);
    const cols = sqlite.prepare(`PRAGMA table_info(${cfg.name})`).all();
    assert.deepEqual(cols.map((c) => c.name).sort(), cfg.columns.map((c) => c.name).sort(), `колонки ${cfg.name}`);
    for (const c of cfg.columns) {
      const db = cols.find((x) => x.name === c.name);
      assert.equal(Boolean(db.notnull) || Boolean(db.pk), c.notNull || c.primary, `NOT NULL ${cfg.name}.${c.name}`);
      assert.equal(Boolean(db.pk), c.primary, `PRIMARY KEY ${cfg.name}.${c.name}`);
    }
    const idx = sqlite.prepare(`PRAGMA index_list(${cfg.name})`).all().filter((i) => i.origin === 'c').map((i) => i.name);
    assert.deepEqual(idx.sort(), cfg.indexes.map((i) => i.config.name).sort(), `индексы ${cfg.name}`);
  }
});

await step('/start показывает меню без админки для клиента', async () => {
  await msg(ALICE, { text: '/start' });
  const [m] = sent(take(), 'sendMessage');
  assert.ok(m.params.text.includes(BUSINESS.name));
  assert.deepEqual(buttons(m), ['book', 'my', 'info']);
});

await step('/start у админа показывает кнопку админки', async () => {
  await msg(ADMIN, { text: '/start' });
  assert.ok(buttons(sent(take(), 'sendMessage')[0]).includes('adm'));
});

await step('/myid возвращает ID', async () => {
  await msg(ALICE, { text: '/myid' });
  assert.match(sent(take(), 'sendMessage')[0].params.text, /<code>1<\/code>/);
});

await step('Записаться → список услуг (редактирует сообщение)', async () => {
  await press(ALICE, 'book');
  const out = take();
  const [e] = sent(out, 'editMessageText');
  assert.deepEqual(buttons(e), [...SERVICES.map((x) => `svc:${x.id}`), 'menu']);
  const labels = e.params.reply_markup.inline_keyboard.flat().map((b) => b.text);
  SERVICES.forEach((x, i) => {
    assert.ok(labels[i].startsWith(x.title));
    if (x.price === 0) assert.match(labels[i], /бесплатно/);
    if (x.price === null) assert.equal(labels[i], x.title);
    if (x.price > 0) assert.match(labels[i], /\d{1,3}(\u00a0\d{3})*\u00a0сум/);
  });
  assert.equal(sent(out, 'answerCallbackQuery').length, 1);
});

await step('Услуга → список дней', async () => {
  await press(ALICE, `svc:${S1}`);
  const [e] = sent(take(), 'editMessageText');
  assert.ok(buttons(e).includes(`day:${S1}:${PACKED}`));
});

await step('День → все слоты дня по расписанию', async () => {
  await press(ALICE, `day:${S1}:${PACKED}`);
  const [e] = sent(take(), 'editMessageText');
  const times = buttons(e).filter((d) => d.startsWith('time:'));
  assert.equal(times.length, SLOTS.length);
  assert.equal(times[0], `time:${S1}:${PACKED}:${P(SLOTS[0])}`);
  assert.equal(times.at(-1), `time:${S1}:${PACKED}:${P(SLOTS.at(-1))}`);
});

await step('Время → просьба отправить номер', async () => {
  await press(ALICE, `time:${S1}:${PACKED}:${P(SLOTS[0])}`);
  const out = take();
  const m = sent(out, 'sendMessage')[0];
  assert.equal(m.params.reply_markup.keyboard[0][0].request_contact, true);
});

await step('Контакт → запись создана, клиенту подтверждение, админу уведомление', async () => {
  await msg(ALICE, { contact: { phone_number: '+998901112233', first_name: 'Алиса', user_id: ALICE } });
  const out = sent(take(), 'sendMessage');
  const toAlice = out.filter((c) => c.params.chat_id === ALICE);
  const toAdmin = out.filter((c) => c.params.chat_id === ADMIN);
  assert.match(toAlice[0].params.text, /Вы записаны/);
  assert.equal(toAlice[0].params.reply_markup.remove_keyboard, true);
  assert.match(toAdmin[0].params.text, /Новая запись[\s\S]*Алиса[\s\S]*\+998901112233/);
  assert.deepEqual(buttons(toAdmin[0]), ['adm:cancel:1']);
  const row = sqlite.prepare('SELECT * FROM bookings').get();
  assert.equal(row.time, SLOTS[0]);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM drafts').get().c, 0);
});

await step('Занятое время пропадает из списка', async () => {
  await press(BOB, `day:${S1}:${PACKED}`);
  const times = buttons(sent(take(), 'editMessageText')[0]);
  assert.ok(!times.includes(`time:${S1}:${PACKED}:${P(SLOTS[0])}`));
  assert.ok(times.includes(`time:${S1}:${PACKED}:${P(SLOTS[1])}`));
});

await step('Нажатие на уже занятое время (старая кнопка) → отказ', async () => {
  await press(BOB, `time:${S1}:${PACKED}:${P(SLOTS[0])}`);
  assert.match(toast(take()), /занято/);
});

await step('Гонка: время заняли, пока клиент отправлял номер', async () => {
  await press(BOB, `time:${S1}:${PACKED}:${P(SLOTS[1])}`);
  take();
  // Кто-то другой успел занять этот слот напрямую.
  sqlite.prepare(`INSERT INTO bookings (user_id, client_name, phone, service_id, date, time)
                  VALUES (3, 'X', '1', ?, ?, ?)`).run(S1, DAY, SLOTS[1]);
  await msg(BOB, { contact: { phone_number: '+998900000000', first_name: 'Боб' } });
  const out = take();
  assert.match(sent(out, 'sendMessage')[0].params.text, /только что заняли/);
  assert.equal(sqlite.prepare("SELECT count(*) c FROM bookings WHERE user_id = 2").get().c, 0);
});

await step('Номер, введённый текстом, тоже принимается', async () => {
  await press(BOB, `time:${S2}:${PACKED}:${P(SLOTS[2])}`);
  take();
  await msg(BOB, { text: '+998 90 000 00 00' });
  const out = sent(take(), 'sendMessage');
  assert.match(out[0].params.text, /Вы записаны/);
});

await step('Произвольный текст без черновика → меню', async () => {
  await msg(ALICE, { text: '+998 90 000 00 00' });
  assert.deepEqual(buttons(sent(take(), 'sendMessage')[0]), ['book', 'my', 'info']);
});

await step('Кнопка «❌ Отменить» на шаге телефона удаляет черновик', async () => {
  await press(ALICE, `time:${S1}:${PACKED}:${P(SLOTS[5])}`);
  take();
  await msg(ALICE, { text: '❌ Отменить' });
  take();
  assert.equal(sqlite.prepare('SELECT count(*) c FROM drafts').get().c, 0);
});

await step('Мои записи → список с кнопкой отмены', async () => {
  await press(ALICE, 'my');
  const e = sent(take(), 'editMessageText')[0];
  assert.ok(e.params.text.includes(SLOTS[0]));
  assert.ok(buttons(e).includes('cancel:1'));
});

await step('Чужую запись отменить нельзя', async () => {
  await press(BOB, 'cancel:1');
  assert.match(toast(take()), /нельзя/);
  assert.equal(sqlite.prepare('SELECT status FROM bookings WHERE id = 1').get().status, 'active');
});

await step('Клиент отменяет свою запись → админ уведомлён', async () => {
  await press(ALICE, 'cancel:1');
  const out = take();
  assert.equal(toast(out), 'Запись отменена');
  assert.match(sent(out, 'sendMessage').find((c) => c.params.chat_id === ADMIN).params.text, /отменил/);
  assert.equal(sqlite.prepare('SELECT status FROM bookings WHERE id = 1').get().status, 'cancelled');
});

await step('После отмены время снова свободно и на него можно записаться', async () => {
  await press(BOB, `time:${S1}:${PACKED}:${P(SLOTS[0])}`);
  take();
  await msg(BOB, { contact: { phone_number: '+998900000000', first_name: 'Боб' } });
  assert.match(sent(take(), 'sendMessage')[0].params.text, /Вы записаны/);
});

await step('Клиент не может открыть админку', async () => {
  await press(ALICE, 'adm');
  assert.match(toast(take()), /Нет доступа/);
});

await step('Админка: дни со счётчиками записей', async () => {
  await press(ADMIN, 'adm');
  const e = sent(take(), 'editMessageText')[0];
  const day = e.params.reply_markup.inline_keyboard.flat().find((b) => b.callback_data === `adm:day:${PACKED}`);
  assert.match(day.text, /\(3\)/); // X (слот 2), Боб (слот 3), Боб (слот 1)
});

await step('Админка: записи дня с телефонами', async () => {
  await press(ADMIN, `adm:day:${PACKED}`);
  const e = sent(take(), 'editMessageText')[0];
  assert.ok(new RegExp(SLOTS.slice(0, 3).join('[\\s\\S]*')).test(e.params.text));
  assert.match(e.params.text, /\+998900000000/);
});

await step('Админ: разослать напоминания', async () => {
  await press(ADMIN, `adm:remind:${PACKED}`);
  const out = take();
  assert.equal(sent(out, 'sendMessage').filter((c) => /Напоминаем/.test(c.params.text)).length, 3);
  assert.match(toast(out), /3 из 3/);
});

await step('Админ отменяет запись → клиенту сообщение', async () => {
  const id = sqlite.prepare("SELECT id FROM bookings WHERE time = ? AND status = 'active'").get(SLOTS[2]).id;
  await press(ADMIN, `adm:cancel:${id}`);
  const out = take();
  assert.match(sent(out, 'sendMessage').find((c) => c.params.chat_id === BOB).params.text, /отменена администратором/);
  assert.match(toast(out), /клиент уведомлён/);
});

await step('«message is not modified» не ломает бота', async () => {
  failures.rule = (m) => m === 'editMessageText'
    ? new BotApiError(m, 400, 'Bad Request: message is not modified') : undefined;
  await press(ALICE, 'menu');
  const out = take();
  assert.equal(sent(out, 'sendMessage').length, 0);
  assert.equal(sent(out, 'answerCallbackQuery').length, 1);
});

await step('Старое сообщение нельзя отредактировать → бот шлёт новое', async () => {
  failures.rule = (m) => m === 'editMessageText'
    ? new BotApiError(m, 400, "Bad Request: message can't be edited") : undefined;
  await press(ALICE, 'menu');
  assert.equal(sent(take(), 'sendMessage').length, 1);
  failures.rule = null;
});

await step('Подделанные кнопки не роняют бота', async () => {
  for (const data of ['svc:hack', `day:${S1}:19990101`, `time:${S1}:19990101:1000`, `time:${S1}`, 'cancel:abc', 'zzz', '']) {
    await press(ALICE, data);
  }
  assert.equal(sent(take(), 'answerCallbackQuery').length, 7);
});

await step('Сообщения из групп игнорируются', async () => {
  await onMessage({ message_id: 1, chat: { id: -100, type: 'group' }, from: user(ALICE), text: '/start' });
  assert.equal(take().length, 0);
});

console.log(`\nВсе проверки пройдены: ${passed}`);
