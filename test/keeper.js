// Локальная проверка бота Keeper (папка keeper/) без Telegram и без деплоя.
// Запуск: cd test && npm run keeper
//
// Вызываем обработчики так же, как это делает платформа, и проверяем, что бот отправил в ответ.

import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../keeper/tgcloud/schema.js';
import { sqlite, calls, failures, BotApiError } from 'sdk';
import { LIMITS, PRO, ADMIN_IDS } from '../keeper/tgcloud/lib/config.js';
import { KEYS, LANGS, hasKey, pickLang } from '../keeper/tgcloud/lib/i18n.js';
import onMessage from '../keeper/tgcloud/handlers/message.js';
import onCallback from '../keeper/tgcloud/handlers/callback_query.js';
import onPreCheckout from '../keeper/tgcloud/handlers/pre_checkout_query.js';
import onConnection from '../keeper/tgcloud/handlers/business_connection.js';
import onBizMessage from '../keeper/tgcloud/handlers/business_message.js';
import onBizEdited from '../keeper/tgcloud/handlers/edited_business_message.js';
import onBizDeleted from '../keeper/tgcloud/handlers/deleted_business_messages.js';
import feedEndpoint from '../keeper/tgcloud/endpoints/feed.js';
import sendMediaEndpoint from '../keeper/tgcloud/endpoints/sendMedia.js';

// Создаём таблицы прямо из keeper/tgcloud/schema.js (на платформе это делает `npx tgcloud migrate`).
for (const t of Object.values(schema)) {
  const cfg = getTableConfig(t);
  const cols = cfg.columns.map((c) => [
    `"${c.name}"`, c.getSQLType(),
    c.primary ? `primary key${c.autoIncrement ? ' autoincrement' : ''}` : '',
    c.notNull && !c.primary ? 'not null' : '',
    c.default !== undefined ? `default ${JSON.stringify(c.default).replaceAll('"', "'")}` : '',
  ].filter(Boolean).join(' '));
  sqlite.exec(`create table "${cfg.name}" (${cols.join(', ')})`);
  for (const i of cfg.indexes) {
    const on = i.config.columns.map((c) => `"${c.name}"`).join(', ');
    sqlite.exec(`create ${i.config.unique ? 'unique ' : ''}index "${i.config.name}" on "${cfg.name}" (${on})`);
  }
}

const OWNER = 10;   // пользователь, подключивший бота (язык — русский)
const FRIEND = 20;  // его собеседник
const OTHER = 30;   // посторонний пользователь
const CONN = 'conn-1';
const now = () => Math.floor(Date.now() / 1000);

const tgUser = (id, lang = 'ru') => ({ id, first_name: `User${id}`, is_bot: false, language_code: lang });
const msg = (id, extra, lang) => onMessage({ message_id: 1, chat: { id, type: 'private' }, from: tgUser(id, lang), date: now(), ...extra });
let qid = 0;
const press = (id, data) => onCallback({ id: String(++qid), from: tgUser(id), data, message: { message_id: 5, chat: { id, type: 'private' } } });
const connect = (enabled, userId = OWNER, id = CONN) => onConnection({ id, user: tgUser(userId), user_chat_id: userId, date: now(), is_enabled: enabled });
let mid = 1000;
const biz = (extra, from = FRIEND) => ({
  business_connection_id: CONN, message_id: ++mid, date: now(),
  chat: { id: FRIEND, type: 'private', first_name: 'Friend' }, from: { id: from, first_name: from === FRIEND ? 'Friend' : 'Owner' }, ...extra,
});
const del = (ids) => onBizDeleted({ business_connection_id: CONN, chat: { id: FRIEND, type: 'private' }, message_ids: ids });
const take = () => calls.splice(0);
const sent = (list, method = 'sendMessage') => list.filter((c) => c.method === method);
const texts = (list) => sent(list).map((c) => c.params.text).join('\n---\n');
const ctx = (id) => ({ initData: { user: tgUser(id) } });
const count = (table) => sqlite.prepare(`select count(*) as n from ${table}`).get().n;
const givePro = (id, until = now() + 1000) => sqlite.prepare('update users set pro_until = ? where id = ?').run(until, id);

let passed = 0;
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${e.message}`);
  } finally {
    take();
    failures.rule = null;
  }
}

await step('Тексты есть на всех языках', () => {
  for (const lang of Object.keys(LANGS)) for (const key of KEYS) assert.ok(hasKey(lang, key), `${lang}: нет текста «${key}»`);
  assert.equal(pickLang('uz'), 'uz');
  assert.equal(pickLang('ru-RU'), 'ru');
  assert.equal(pickLang('de'), 'en');
});

await step('/start → меню на языке пользователя, бот ещё не подключён', async () => {
  await msg(OWNER, { text: '/start' });
  const out = take();
  assert.match(texts(out), /Бот пока не подключён/);
  assert.match(texts(out), /бесплатный/);
  await msg(OTHER, { text: '/start' }, 'uz');
  assert.match(texts(take()), /ulanmagan/);
});

await step('Сообщения из групп игнорируются', async () => {
  await onMessage({ message_id: 1, chat: { id: -5, type: 'group' }, from: tgUser(OWNER), text: '/start' });
  assert.equal(take().length, 0);
});

await step('Подключение бота → сообщение «Подключено»', async () => {
  await connect(true);
  assert.match(texts(take()), /Подключено/);
  await msg(OWNER, { text: '/start' });
  assert.match(texts(take()), /Бот подключён/);
});

await step('Сообщение собеседника сохраняется молча, своё — не сохраняется', async () => {
  await onBizMessage(biz({ text: 'привет' }));
  await onBizMessage(biz({ text: 'моё сообщение' }, OWNER));
  assert.equal(take().length, 0);
  assert.equal(count('messages'), 1);
});

await step('Защищённый от копирования контент не сохраняется', async () => {
  await onBizMessage(biz({ text: 'секрет', has_protected_content: true }));
  assert.equal(count('messages'), 1);
});

await step('Собеседник удалил текст → владелец получает его', async () => {
  const m = biz({ text: 'удали <b>меня</b>' });
  await onBizMessage(m);
  await del([m.message_id]);
  const out = sent(take());
  assert.equal(out.length, 1);
  assert.equal(out[0].params.chat_id, OWNER);
  assert.match(out[0].params.text, /Friend/);
  assert.match(out[0].params.text, /удали &lt;b&gt;меня&lt;\/b&gt;/); // текст экранирован
});

await step('Повторное событие об удалении → второго уведомления нет', async () => {
  const m = biz({ text: 'один раз' });
  await onBizMessage(m);
  await del([m.message_id]);
  assert.equal(sent(take()).length, 1);
  await del([m.message_id]);
  assert.equal(take().length, 0);
});

await step('Удаление неизвестного сообщения → тишина', async () => {
  await del([999999]);
  assert.equal(take().length, 0);
});

await step('Собеседник изменил текст → «было / стало»', async () => {
  const m = biz({ text: 'приду в 5' });
  await onBizMessage(m);
  await onBizEdited({ ...m, text: 'приду в 7' });
  const text = texts(take());
  assert.match(text, /приду в 5/);
  assert.match(text, /приду в 7/);
  await onBizEdited({ ...m, text: 'приду в 7' }); // то же самое ещё раз — ничего не шлём
  assert.equal(take().length, 0);
});

await step('Изменили очень длинное сообщение → уведомление помещается в лимит Telegram', async () => {
  const m = biz({ text: '😀&'.repeat(2000) });
  await onBizMessage(m);
  await onBizEdited({ ...m, text: '<я>'.repeat(1400) });
  const out = sent(take());
  assert.equal(out.length, 1);
  // Telegram считает длину после разбора разметки: &amp; — это один знак, теги не считаются.
  const plain = out[0].params.text.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt);/g, '&');
  assert.ok(plain.length <= 4096, `длина ${plain.length}`);
  assert.doesNotMatch(out[0].params.text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // эмодзи не разорван
  // Убираем за собой, чтобы длинная запись не мешала следующим проверкам истории.
  sqlite.prepare('delete from edits where msg_id in (select id from messages where message_id = ?)').run(m.message_id);
  sqlite.prepare('delete from messages where message_id = ?').run(m.message_id);
});

await step('Без Pro: удалённое фото — только подпись и подсказка про Pro', async () => {
  const m = biz({ photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: 'смотри' });
  await onBizMessage(m);
  await del([m.message_id]);
  const out = take();
  assert.match(texts(out), /смотри/);
  assert.match(texts(out), /\/pro/);
  assert.equal(sent(out, 'sendPhoto').length, 0);
});

await step('Мини-приложение без Pro: не больше лимита записей', async () => {
  const data = await feedEndpoint({ type: 'deleted' }, ctx(OWNER));
  assert.equal(data.pro, false);
  assert.equal(data.connected, true);
  assert.ok(data.items.length >= 2 && data.items.length <= LIMITS.freeFeed);
  const edited = await feedEndpoint({ type: 'edited' }, ctx(OWNER));
  assert.deepEqual(edited.items[0].versions, ['приду в 5']);
});

await step('Чужую историю в мини-приложении не видно', async () => {
  const data = await feedEndpoint({ type: 'deleted' }, ctx(OTHER));
  assert.equal(data.items.length, 0);
  assert.equal(data.connected, false);
});

await step('Файл из мини-приложения без Pro не отдаётся', async () => {
  const { items } = await feedEndpoint({ type: 'deleted' }, ctx(OWNER));
  const photo = items.find((i) => i.hasFile);
  await assert.rejects(() => sendMediaEndpoint({ id: photo.id }, ctx(OWNER)));
});

await step('/pro → ссылка на оплату звёздами с ежемесячной подпиской', async () => {
  await msg(OWNER, { text: '/pro' });
  const link = sent(take(), 'createInvoiceLink')[0].params;
  assert.equal(link.currency, 'XTR');
  assert.equal(link.prices[0].amount, PRO.stars);
  assert.equal(link.subscription_period, PRO.periodSeconds);
});

await step('Проверка перед оплатой: свой счёт принимаем, чужой — нет', async () => {
  await onPreCheckout({ id: 'q1', from: tgUser(OWNER), currency: 'XTR', total_amount: PRO.stars, invoice_payload: 'pro' });
  assert.equal(sent(take(), 'answerPreCheckoutQuery')[0].params.ok, true);
  await onPreCheckout({ id: 'q2', from: tgUser(OWNER), currency: 'XTR', total_amount: 1, invoice_payload: 'x' });
  assert.equal(sent(take(), 'answerPreCheckoutQuery')[0].params.ok, false);
});

await step('Оплата → Pro включён, повтор того же платежа не считается дважды', async () => {
  const until = now() + PRO.periodSeconds;
  const pay = { successful_payment: { currency: 'XTR', total_amount: PRO.stars, invoice_payload: 'pro',
    telegram_payment_charge_id: 'ch1', subscription_expiration_date: until } };
  await msg(OWNER, pay);
  assert.match(texts(take()), /Pro включён/);
  await msg(OWNER, pay);
  assert.equal(take().length, 0);
  assert.equal(count('payments'), 1);
  assert.equal(sqlite.prepare('select pro_until as p from users where id = ?').get(OWNER).p, until);
});

await step('С Pro: удалённое голосовое приходит файлом', async () => {
  const m = biz({ voice: { file_id: 'voice-1' } });
  await onBizMessage(m);
  await del([m.message_id]);
  const out = take();
  assert.equal(sent(out, 'sendVoice')[0].params.voice, 'voice-1');
  assert.doesNotMatch(texts(out), /\/pro/);
});

await step('С Pro: файл из мини-приложения приходит в чат; чужой — нет', async () => {
  const { items, pro } = await feedEndpoint({ type: 'deleted' }, ctx(OWNER));
  assert.equal(pro, true);
  const voice = items.find((i) => i.kind === 'voice');
  await sendMediaEndpoint({ id: voice.id }, ctx(OWNER));
  assert.equal(sent(take(), 'sendVoice').length, 1);
  givePro(OTHER);
  await assert.rejects(() => sendMediaEndpoint({ id: voice.id }, ctx(OTHER)));
});

await step('Удалили много сообщений сразу → итог и только первые', async () => {
  const ids = [];
  for (let i = 0; i < LIMITS.notifyPerDelete + 3; i++) {
    const m = biz({ text: `сообщение ${i}` });
    ids.push(m.message_id);
    await onBizMessage(m);
  }
  await del(ids);
  assert.equal(sent(take()).length, LIMITS.notifyPerDelete + 1);
});

await step('Пользователь заблокировал бота → бот не падает', async () => {
  failures.rule = (method) => (method === 'sendMessage' ? new BotApiError(method, 403, 'Forbidden: bot was blocked by the user') : undefined);
  const m = biz({ text: 'x' });
  await onBizMessage(m);
  await del([m.message_id]);
});

await step('Старые записи стираются: бесплатные раньше, Pro позже', async () => {
  const day = 24 * 60 * 60;
  const add = (owner, age) => sqlite.prepare(
    "insert into messages (conn_id, owner_id, chat_id, message_id, from_name, date, kind, text) values ('c', ?, 1, ?, 'n', ?, 'text', 'old')",
  ).run(owner, ++mid, now() - age * day);
  add(OTHER, LIMITS.freeDays + 1);          // OTHER сейчас с Pro → остаётся
  add(OTHER, LIMITS.proDays + 1);           // слишком старое даже для Pro → стирается
  givePro(OWNER, 0);
  add(OWNER, LIMITS.freeDays + 1);          // OWNER без Pro → стирается
  const before = count('messages');
  await onBizMessage({ ...biz({ text: 'свежее' }), message_id: 5000 }); // кратно 50 → запускает уборку
  assert.equal(count('messages'), before + 1 - 2);
});

await step('Смена языка кнопкой', async () => {
  await press(OWNER, 'lang:en');
  const out = take();
  assert.match(texts(out), /deleted or edited/);
  await press(OWNER, 'lang:ru');
});

await step('«Удалить всё» → подтверждение → данные стёрты', async () => {
  await press(OWNER, 'wipe:ask');
  assert.match(texts(take()), /Удалить все/);
  await press(OWNER, 'wipe:yes');
  assert.equal(sqlite.prepare('select count(*) as n from messages where owner_id = ?').get(OWNER).n, 0);
});

await step('/stats — только для владельца бота', async () => {
  await msg(OWNER, { text: '/stats' });
  assert.doesNotMatch(texts(take()), /📊/);
  await msg(ADMIN_IDS[0], { text: '/stats' });
  assert.match(texts(take()), /📊/);
});

await step('Отключение бота → данные стёрты, новые сообщения не сохраняются', async () => {
  await onBizMessage(biz({ text: 'перед отключением' }));
  await connect(false);
  assert.match(texts(take()), /отключён/);
  await onBizMessage(biz({ text: 'после отключения' }));
  assert.equal(sqlite.prepare('select count(*) as n from messages where owner_id = ?').get(OWNER).n, 0);
});

await step('Подделанные кнопки не роняют бота', async () => {
  for (const data of ['lang:xx', 'wipe:', '', 'pro:1']) await press(OWNER, data);
});

console.log(failed ? `\n❌ Ошибок: ${failed}` : `\nВсе проверки пройдены: ${passed}`);
process.exit(failed ? 1 : 0);
