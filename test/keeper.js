// Локальная проверка бота Keeper (папка keeper/) без Telegram и без деплоя.
// Запуск: cd test && npm run keeper
//
// Вызываем обработчики так же, как это делает платформа, и проверяем, что бот отправил в ответ.

import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../keeper/tgcloud/schema.js';
import { sqlite, calls, failures, BotApiError } from 'sdk';
import { LIMITS, PRO, ADMIN_IDS, OWNER_ID, NOTIFY, REF } from '../keeper/tgcloud/lib/config.js';
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
import chatsEndpoint from '../keeper/tgcloud/endpoints/chats.js';
import statsEndpoint from '../keeper/tgcloud/endpoints/stats.js';
import settingsEndpoint from '../keeper/tgcloud/endpoints/settings.js';
import adminEndpoint from '../keeper/tgcloud/endpoints/admin.js';
import mediaEndpoint from '../keeper/tgcloud/endpoints/media.js';
import invoiceEndpoint from '../keeper/tgcloud/endpoints/invoice.js';
import exportEndpoint from '../keeper/tgcloud/endpoints/export.js';
import pinEndpoint from '../keeper/tgcloud/endpoints/pin.js';
import promoEndpoint from '../keeper/tgcloud/endpoints/promo.js';
import onMyChatMember from '../keeper/tgcloud/handlers/my_chat_member.js';
import { base64, utf8 } from '../keeper/tgcloud/lib/app.js';

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
const userRow = (id) => sqlite.prepare('select * from users where id = ?').get(id);
const setMode = (id, mode) => sqlite.prepare('update users set notify = ? where id = ?').run(mode, id);

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
  await msg(OTHER, { text: '/start' }, 'uz');
  assert.match(texts(take()), /ulanmagan/);
});

await step('Новый пользователь: пробный Pro один раз и тихий режим по умолчанию', async () => {
  const u = userRow(OWNER);
  assert.equal(u.trial, 1);
  assert.ok(Math.abs(u.pro_until - (now() + PRO.trialDays * 86400)) < 5);
  assert.equal(u.notify, NOTIFY.off);
  await msg(OWNER, { text: '/start' });
  assert.match(texts(take()), /Pro активен/);
  assert.match(texts(take()), /^$/);
  givePro(OWNER, 0);                      // пробный срок «закончился»
  await msg(OWNER, { text: '/start' });   // второй раз пробный не выдаётся
  assert.match(texts(take()), /бесплатный/);
  // Дальше старые сценарии проверяют полные уведомления — включаем этот режим.
  setMode(OWNER, NOTIFY.full);
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
  assert.deepEqual(edited.items[0].versions.map((v) => v.text), ['приду в 5']);
});

await step('Мини-приложение: список собеседников со счётчиками', async () => {
  const data = await chatsEndpoint({}, ctx(OWNER));
  assert.equal(data.chats.length, 1);
  const chat = data.chats[0];
  assert.equal(chat.chatId, FRIEND);
  assert.equal(chat.name, 'Friend');
  assert.ok(chat.saved >= 4 && chat.deleted >= 2 && chat.edited >= 1);
  assert.ok(chat.eventAt > 0);
  assert.equal((await chatsEndpoint({}, ctx(OTHER))).chats.length, 0); // чужих чатов не видно
});

await step('Мини-приложение: лента одного собеседника, общая лента без повторов', async () => {
  const one = await feedEndpoint({ type: 'all', chatId: FRIEND }, ctx(OWNER));
  assert.ok(one.items.length >= 3);
  assert.equal(new Set(one.items.map((i) => i.id)).size, one.items.length);
  assert.ok(one.items.every((i) => i.chatId === FRIEND && i.date > 0 && (i.deletedAt || i.editedAt)));
  assert.equal((await feedEndpoint({ type: 'all', chatId: 12345 }, ctx(OWNER))).items.length, 0);
});

await step('Подробности сообщения сохраняются: размер, длительность, пересылка, отправитель', async () => {
  const m = biz({ voice: { file_id: 'v-meta', duration: 7, file_size: 2048, mime_type: 'audio/ogg' },
    forward_origin: { type: 'user', sender_user: { first_name: 'Вася' } }, reply_to_message: { message_id: 1, text: 'моё' } });
  m.from.username = 'friend_nick';
  await onBizMessage(m);
  await del([m.message_id]);
  take();
  const { items } = await feedEndpoint({ type: 'deleted', chatId: FRIEND }, ctx(OWNER));
  const item = items.find((i) => i.kind === 'voice');
  assert.deepEqual(item.meta, { size: 2048, duration: 7, mime: 'audio/ogg', forward: 'Вася', reply: true });
  assert.equal(item.username, 'friend_nick');
  assert.equal(item.fromId, FRIEND);
  assert.doesNotMatch(JSON.stringify(item), /моё/); // текст, на который ответили, не храним
  sqlite.prepare('delete from messages where message_id = ?').run(m.message_id);
});

await step('Тихий режим и «без уведомлений» по чату: в чат не пишем, в истории всё есть', async () => {
  const quiet = async (text) => {
    const m = biz({ text });
    await onBizMessage(m);
    await onBizEdited({ ...m, text: `${text}!` });
    await del([m.message_id]);
    return m;
  };
  assert.equal((await settingsEndpoint({ notify: NOTIFY.off }, ctx(OWNER))).notify, NOTIFY.off);
  await quiet('тихо');
  assert.equal(take().length, 0);
  await settingsEndpoint({ notify: NOTIFY.full }, ctx(OWNER));
  await settingsEndpoint({ mute: { chatId: FRIEND, muted: true } }, ctx(OWNER));
  const m = await quiet('без звука');
  assert.equal(take().length, 0);
  assert.equal((await chatsEndpoint({}, ctx(OWNER))).chats[0].muted, true);
  await settingsEndpoint({ mute: { chatId: FRIEND, muted: false } }, ctx(OWNER));
  const { items } = await feedEndpoint({ type: 'all', chatId: FRIEND }, ctx(OWNER));
  assert.ok(items.some((i) => i.text === 'без звука!' && i.deletedAt && i.editedAt));
  sqlite.prepare("delete from edits where msg_id in (select id from messages where text in ('тихо!', 'без звука!'))").run();
  sqlite.prepare("delete from messages where text in ('тихо!', 'без звука!')").run();
  assert.ok(m);
});

await step('Кнопка «Уведомления» в меню бота переключает режим', async () => {
  setMode(OWNER, NOTIFY.off);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await press(OWNER, 'notify');
    take();
    seen.push(userRow(OWNER).notify);
  }
  assert.deepEqual(seen, [NOTIFY.short, NOTIFY.digest, NOTIFY.full, NOTIFY.off]); // по кругу
  await press(OWNER, 'notify');
  assert.match(texts(take()), /одна строка/);
  setMode(OWNER, NOTIFY.full);
});

await step('Короткий режим: одна строка с кнопкой «Открыть», без текста сообщения', async () => {
  setMode(OWNER, NOTIFY.short);
  const m = biz({ text: 'секретный текст' });
  await onBizMessage(m);
  await onBizEdited({ ...m, text: 'секретный текст 2' });
  await del([m.message_id]);
  const out = sent(take());
  assert.equal(out.length, 2);
  assert.doesNotMatch(texts(out), /секретный/);
  assert.match(out[1].params.text, /Friend<\/b> удалил/);
  sqlite.prepare("delete from edits where msg_id in (select id from messages where text like 'секретный%')").run();
  sqlite.prepare("delete from messages where text like 'секретный%'").run();
  setMode(OWNER, NOTIFY.full);
});

await step('Сводка: одно сообщение при первом событии дня, остальное молча', async () => {
  setMode(OWNER, NOTIFY.digest);
  sqlite.prepare('update users set digest_day = 0, digest_del = 4, digest_ed = 2 where id = ?').run(OWNER);
  const ids = [];
  for (const text of ['сводка 1', 'сводка 2', 'сводка 3']) { const m = biz({ text }); ids.push(m.message_id); await onBizMessage(m); }
  await del([ids[0]]);
  const first = sent(take());
  assert.equal(first.length, 1);
  assert.match(first[0].params.text, /Первое событие за сегодня/);
  assert.match(first[0].params.text, /удалено 4, изменено 2/); // итог прошлого дня
  await del([ids[1], ids[2]]);
  assert.equal(take().length, 0);
  assert.equal(userRow(OWNER).digest_del, 3);
  sqlite.prepare("delete from messages where text like 'сводка%'").run();
  setMode(OWNER, NOTIFY.full);
});

await step('Только избранные: уведомление приходит лишь о собеседнике со звёздочкой', async () => {
  const once = async (text) => { const m = biz({ text }); await onBizMessage(m); await del([m.message_id]); return sent(take()).length; };
  assert.equal((await settingsEndpoint({ favOnly: true }, ctx(OWNER))).favOnly, true);
  assert.equal(await once('не избранный'), 0);
  await settingsEndpoint({ fav: { chatId: FRIEND, fav: true } }, ctx(OWNER));
  assert.equal((await chatsEndpoint({}, ctx(OWNER))).chats[0].fav, true);
  assert.equal(await once('избранный'), 1);
  await settingsEndpoint({ favOnly: false, fav: { chatId: FRIEND, fav: false } }, ctx(OWNER));
  sqlite.prepare("delete from messages where text in ('не избранный', 'избранный')").run();
});

await step('Поиск по тексту в ленте', async () => {
  const hit = await feedEndpoint({ type: 'all', q: 'МЕНЯ' }, ctx(OWNER));
  assert.ok(hit.items.length >= 1 && hit.items.every((i) => /меня/i.test(i.text)));
  assert.equal((await feedEndpoint({ type: 'all', q: 'такого нет %' }, ctx(OWNER))).items.length, 0);
});

await step('Аналитика: итоги, дни, часы, виды, скорость удаления', async () => {
  const data = await statsEndpoint({ tz: 300 }, ctx(OWNER));
  assert.equal(data.totals.chats, 1);
  assert.ok(data.totals.deleted >= 2 && data.totals.edited >= 1);
  assert.equal(data.days.length, 14);
  assert.equal(data.hours.length, 24);
  assert.equal(data.days.at(-1).deleted, data.hours.reduce((a, b) => a + b, 0)); // всё удалено сегодня
  assert.ok(data.kinds.text >= 1 && data.kinds.photo >= 1);
  assert.ok(data.life.count >= 2 && data.top[0].name === 'Friend');
  assert.equal((await statsEndpoint({}, ctx(OTHER))).totals.deleted, 0);
});

await step('Админ-панель: только для админа, без текстов сообщений; подарить и снять Pro', async () => {
  await assert.rejects(() => adminEndpoint({}, ctx(OWNER)));
  const admin = ctx(ADMIN_IDS[0]);
  const data = await adminEndpoint({}, admin);
  assert.equal(data.admin, true);
  assert.ok(data.totals.users >= 3 && data.totals.conns === 1 && data.totals.deleted >= 2);
  const owner = data.users.find((u) => u.id === OWNER);
  assert.equal(owner.name, `User${OWNER}`);
  assert.equal(owner.connected, true);
  assert.ok(owner.chats === 1 && owner.deleted >= 2);
  assert.doesNotMatch(JSON.stringify(data), /приду в|смотри|удали/);
  assert.ok(data.totals.started >= 3 && data.totals.everConnected === 1 && data.totals.paid === 0); // воронка
  const gift = await adminEndpoint({ action: 'pro', userId: OTHER, days: 30 }, admin);
  assert.equal(gift.users.find((u) => u.id === OTHER).pro, true);
  const off = await adminEndpoint({ action: 'pro', userId: OTHER, days: 0 }, admin);
  assert.equal(off.users.find((u) => u.id === OTHER).pro, false);
  await assert.rejects(() => adminEndpoint({ action: 'pro', userId: 424242, days: 30 }, admin));
  await assert.rejects(() => adminEndpoint({ action: 'pro', userId: OTHER, days: 30 }, ctx(OTHER)));
});

await step('Владелец: бессрочный VIP; может выдать и снять VIP командой и из админ-панели', async () => {
  const admin = ctx(OWNER_ID);
  const me = await chatsEndpoint({}, admin);
  assert.equal(me.plan, 'owner');
  assert.equal(me.pro, true);
  await msg(OWNER_ID, { text: '/start' });
  assert.match(texts(take()), /Владелец · VIP бессрочно/);
  givePro(OTHER, 0);
  await msg(OWNER_ID, { text: `/vip ${OTHER}` });
  const out = sent(take());
  assert.ok(out.some((c) => c.params.chat_id === OTHER && /VIP/.test(c.params.text))); // человеку пришло сообщение
  assert.equal((await chatsEndpoint({}, ctx(OTHER))).plan, 'vip');
  await assert.rejects(() => invoiceEndpoint({}, ctx(OTHER)));                          // VIP платить не нужно
  await msg(OWNER_ID, { text: `/unvip ${OTHER}` });
  assert.equal((await chatsEndpoint({}, ctx(OTHER))).plan, 'free');
  await msg(OWNER, { text: `/vip ${OWNER}` });                                          // не владелец — команда не работает
  assert.equal(userRow(OWNER).vip, 0);
  take();
  // Из админ-панели, в том числе человеку, который ещё не запускал бота.
  const data = await adminEndpoint({ action: 'vip', userId: 777001, on: true }, admin);
  assert.equal(data.users.find((u) => u.id === 777001).vip, true);
  take();
  await msg(777001, { text: '/start' });
  assert.match(texts(take()), /VIP бессрочно/);
  await adminEndpoint({ action: 'vip', userId: OWNER_ID, on: false }, admin);           // с владельца VIP не снять
  assert.equal(userRow(OWNER_ID).vip, 1);
  await assert.rejects(() => adminEndpoint({ action: 'vip', userId: OWNER, on: true }, ctx(OWNER)));
  take();
});

await step('Приглашение: друг подключил бота → пригласивший получает дни Pro один раз', async () => {
  const NEWBIE = 40;
  await msg(NEWBIE, { text: `/start ref_${OTHER}` });
  await msg(NEWBIE, { text: '/start ref_999' }); // второй раз пригласившего не сменить
  take();
  assert.equal(userRow(NEWBIE).ref_by, OTHER);
  const before = userRow(OTHER).pro_until;
  await connect(true, NEWBIE, 'conn-new');
  const out = sent(take());
  assert.ok(out.some((c) => c.params.chat_id === OTHER && /начислено/.test(c.params.text) === false)); // у OTHER язык узбекский
  assert.ok(userRow(OTHER).pro_until >= Math.max(before, now()) + REF.days * 86400 - 5);
  assert.equal((await chatsEndpoint({}, ctx(OTHER))).refs, 1);
  const after = userRow(OTHER).pro_until;
  await connect(false, NEWBIE, 'conn-new');
  await connect(true, NEWBIE, 'conn-new');       // повторное подключение награду не даёт
  assert.equal(userRow(OTHER).pro_until, after);
  await msg(OWNER, { text: `/start ref_${OWNER}` }); // сам себя пригласить нельзя
  assert.equal(userRow(OWNER).ref_by, null);
  givePro(OTHER, 0);
  take();
});

await step('Рассылка из админ-панели: только админ, порциями, без тех, кто не запускал бота', async () => {
  const admin = ctx(OWNER_ID);
  await assert.rejects(() => adminEndpoint({ action: 'broadcast', text: 'x' }, ctx(OWNER)));
  await assert.rejects(() => adminEndpoint({ action: 'broadcast', text: '  ' }, admin));
  const started = sqlite.prepare("select count(*) as n from users where name <> ''").get().n;
  const res = await adminEndpoint({ action: 'broadcast', text: 'Новость <b>для всех</b>' }, admin);
  const out = sent(take());
  assert.equal(res.sent, started);
  assert.equal(res.next, null);
  assert.equal(out.length, started);
  assert.ok(out.every((c) => c.params.text === 'Новость &lt;b&gt;для всех&lt;/b&gt;'));
});

await step('«Сейф»: удалённый файл копируется в канал пользователя (только с Pro)', async () => {
  const VAULT = -100500;
  const join = (status, from = OWNER) => onMyChatMember({ chat: { id: VAULT, type: 'channel', title: 'Мой сейф' }, from: tgUser(from),
    new_chat_member: { status, can_post_messages: true } });
  await onMyChatMember({ chat: { id: OWNER, type: 'private' }, from: tgUser(OWNER), new_chat_member: { status: 'kicked' } }); // личный чат — не сейф
  assert.equal(userRow(OWNER).vault_id, null);
  await join('administrator');
  assert.match(texts(take()), /Сейф.+Мой сейф/);
  assert.equal((await chatsEndpoint({}, ctx(OWNER))).vault, 'Мой сейф');
  const drop = async (extra) => { const m = biz(extra); await onBizMessage(m); await del([m.message_id]); return take(); };
  assert.equal(sent(await drop({ photo: [{ file_id: 'v-1' }], caption: 'без про' }), 'sendPhoto').length, 0); // без Pro не копируем
  givePro(OWNER);
  setMode(OWNER, NOTIFY.off);
  const out = await drop({ document: { file_id: 'v-doc', file_name: 'a.pdf' }, caption: 'договор' });
  const copy = sent(out, 'sendDocument')[0].params;
  assert.equal(copy.chat_id, VAULT);
  assert.equal(copy.document, 'v-doc');
  assert.match(copy.caption, /Friend .+\nдоговор/);
  assert.equal(sent(await drop({ text: 'просто текст' }), 'sendDocument').length, 0);                 // текст в сейф не идёт
  // При правке заменили файл — прежний уходит в сейф.
  const m = biz({ photo: [{ file_id: 'v-old' }] });
  await onBizMessage(m);
  await onBizEdited({ ...m, photo: [{ file_id: 'v-new' }] });
  assert.equal(sent(take(), 'sendPhoto')[0].params.photo, 'v-old');
  // Бота убрали из канала: Telegram отвечает 403 — «сейф» отвязывается сам.
  failures.rule = (method, params) => (params.chat_id === VAULT ? new BotApiError(method, 403, 'Forbidden: bot is not a member of the channel chat') : undefined);
  await drop({ photo: [{ file_id: 'v-2' }] });
  failures.rule = null;
  assert.equal(userRow(OWNER).vault_id, null);
  await join('administrator');
  await join('left');                                                                               // вышел из канала
  assert.equal(userRow(OWNER).vault_id, null);
  sqlite.prepare("delete from edits where owner_id = ? and msg_id in (select id from messages where file_id like 'v-%')").run(OWNER);
  sqlite.prepare("delete from messages where file_id like 'v-%' or text = 'просто текст'").run();
  givePro(OWNER, 0);
  setMode(OWNER, NOTIFY.full);
  take();
});

await step('Галерея: только фото и видео, у фото есть уменьшенное превью', async () => {
  const m = biz({ photo: [{ file_id: 'g-s', width: 90 }, { file_id: 'g-m', width: 320 }, { file_id: 'g-l', width: 1280 }] });
  await onBizMessage(m);
  await del([m.message_id]);
  take();
  const { items } = await feedEndpoint({ type: 'media', chatId: FRIEND }, ctx(OWNER));
  assert.ok(items.length >= 2 && items.every((i) => ['photo', 'video', 'video_note', 'animation'].includes(i.kind)));
  assert.equal(items.find((i) => i.id === Math.max(...items.map((x) => x.id))).hasThumb, true);
  givePro(OWNER);
  await mediaEndpoint({ id: Math.max(...items.map((x) => x.id)), thumb: true }, ctx(OWNER));
  assert.equal(sent(take(), 'getFileStream')[0].params, 'g-m');                                      // превью — средний размер
  givePro(OWNER, 0);
  sqlite.prepare("delete from messages where file_id = 'g-l'").run();
});

await step('Закладки: не стираются по сроку, есть предел', async () => {
  // Свои сообщения для этого сценария, чтобы не задеть соседние.
  const ids = [];
  for (let i = 0; i <= LIMITS.freeKept; i++) { const m = biz({ text: `закл ${i}` }); ids.push(m.message_id); await onBizMessage(m); }
  await del(ids);
  take();
  const mine = (await feedEndpoint({ type: 'deleted', chatId: FRIEND, q: 'закл' }, ctx(OWNER))).items;
  assert.equal(mine.length, LIMITS.freeKept + 1);
  const [target, other] = mine;
  await settingsEndpoint({ keep: { id: target.id, on: true } }, ctx(OWNER));
  const kept = await feedEndpoint({ type: 'kept' }, ctx(OWNER));
  assert.deepEqual(kept.items.map((i) => [i.id, i.kept]), [[target.id, true]]);
  await assert.rejects(() => settingsEndpoint({ keep: { id: target.id, on: true } }, ctx(OTHER)));    // чужое сообщение
  // Старое сообщение с закладкой переживает уборку, без закладки — нет.
  const old = now() - (LIMITS.proDays + 5) * 86400;
  sqlite.prepare('update messages set date = ? where id in (?, ?)').run(old, target.id, other.id);
  await onBizMessage({ ...biz({ text: 'закл уборка' }), message_id: 6000 });
  assert.ok(sqlite.prepare('select id from messages where id = ?').get(target.id));
  assert.equal(sqlite.prepare('select id from messages where id = ?').get(other.id), undefined);
  // Предел для бесплатного тарифа.
  for (const item of mine.slice(2)) await settingsEndpoint({ keep: { id: item.id, on: true } }, ctx(OWNER));
  assert.equal(sqlite.prepare('select count(*) as n from messages where owner_id = ? and kept = 1').get(OWNER).n, LIMITS.freeKept);
  const extra = sqlite.prepare("select id from messages where text = 'закл уборка'").get().id;
  await assert.rejects(() => settingsEndpoint({ keep: { id: extra, on: true } }, ctx(OWNER)), /предел/);
  await settingsEndpoint({ keep: { id: target.id, on: false } }, ctx(OWNER));                         // сняли одну — место появилось
  await settingsEndpoint({ keep: { id: extra, on: true } }, ctx(OWNER));
  sqlite.prepare("delete from messages where text like 'закл%'").run();
});

await step('PIN-код: без него приложение ничего не отдаёт; пауза после неверных попыток; сброс стирает данные', async () => {
  const USER = 40; // у него есть подключение из сценария с приглашением
  const withPin = (pin) => chatsEndpoint({ pin }, ctx(USER));
  await assert.rejects(() => pinEndpoint({ set: '12' }, ctx(USER)), /от 4 до 8/);
  assert.equal((await pinEndpoint({ set: '1234' }, ctx(USER))).hasPin, true);
  assert.notEqual(userRow(USER).pin, '1234');                                                        // сами цифры в базе не лежат
  await assert.rejects(() => withPin(undefined), (e) => e.message === 'PIN');
  await assert.rejects(() => feedEndpoint({ type: 'all' }, ctx(USER)));
  await assert.rejects(() => withPin('0000'), /Осталось попыток: 4/);
  assert.equal((await withPin('1234')).hasPin, true);
  assert.equal(userRow(USER).pin_fails, 0);                                                          // верный ввод сбрасывает счётчик
  for (let i = 0; i < LIMITS.pinTries; i++) await assert.rejects(() => withPin('9999'));
  await assert.rejects(() => withPin('1234'), /Слишком много попыток/);                              // даже верный PIN ждёт
  sqlite.prepare('update users set pin_lock = 0 where id = ?').run(USER);
  await pinEndpoint({ pin: '1234', set: '567890' }, ctx(USER));                                      // смена
  await assert.rejects(() => withPin('1234'));
  assert.equal((await pinEndpoint({ pin: '567890', remove: true }, ctx(USER))).hasPin, false);
  assert.equal((await withPin(undefined)).hasPin, false);
  // Забыл PIN: /resetpin → подтверждение → PIN снят, данные стёрты.
  await pinEndpoint({ set: '4321' }, ctx(USER));
  sqlite.prepare("insert into messages (conn_id, owner_id, chat_id, message_id, from_name, date, kind, text) values ('conn-new', ?, 1, 1, 'n', ?, 'text', 'x')").run(USER, now());
  await msg(USER, { text: '/resetpin' });
  assert.match(texts(take()), /удалить все данные/);
  await press(USER, 'pin:reset');
  assert.equal(userRow(USER).pin, null);
  assert.equal(sqlite.prepare('select count(*) as n from messages where owner_id = ?').get(USER).n, 0);
  take();
});

await step('Промокоды: создаёт админ, один раз на человека, есть предел использований', async () => {
  const admin = ctx(OWNER_ID);
  await assert.rejects(() => adminEndpoint({ action: 'promoAdd', code: 'ab', days: 7, uses: 1 }, admin));
  const data = await adminEndpoint({ action: 'promoAdd', code: ' new-year 2027 ', days: 10, uses: 2 }, admin);
  assert.deepEqual(data.promos.map((p) => [p.code, p.days, p.maxUses, p.used]), [['NEWYEAR2027', 10, 2, 0]]);
  await assert.rejects(() => adminEndpoint({ action: 'promoAdd', code: 'NEWYEAR2027', days: 1, uses: 1 }, admin)); // такой уже есть
  await assert.rejects(() => adminEndpoint({ action: 'promoAdd', code: 'HACKER', days: 999, uses: 1 }, ctx(OWNER)));
  givePro(OTHER, 0);
  const res = await promoEndpoint({ code: 'newyear2027' }, ctx(OTHER));
  assert.equal(res.profile.pro, true);
  assert.ok(Math.abs(userRow(OTHER).pro_until - (now() + 10 * 86400)) < 5);
  await assert.rejects(() => promoEndpoint({ code: 'NEWYEAR2027' }, ctx(OTHER)), /уже использовали|allaqachon/);
  await assert.rejects(() => promoEndpoint({ code: 'NOPE1' }, ctx(OTHER)));
  await msg(OWNER, { text: '/promo NewYear2027' });                                                  // второй человек — командой в боте
  assert.match(texts(take()), /Промокод принят: \+10/);
  await msg(40, { text: '/promo NEWYEAR2027' });                                                     // третий — код закончился
  assert.match(texts(take()), /закончился/);
  assert.equal((await adminEndpoint({ action: 'promoDel', code: 'NEWYEAR2027' }, admin)).promos.length, 0);
  givePro(OTHER, 0);
  givePro(OWNER, 0);
});

await step('Цена и лимиты из админ-панели: меняет только владелец, с проверкой значений', async () => {
  const admin = ctx(OWNER_ID);
  const before = { stars: PRO.stars, freeDays: LIMITS.freeDays, proDays: LIMITS.proDays, freeFeed: LIMITS.freeFeed, trialDays: PRO.trialDays };
  const data = await adminEndpoint({ action: 'settings', values: { stars: 200, freeFeed: 1, trialDays: 0 } }, admin);
  assert.equal(data.settings.stars.value, 200);
  assert.equal(data.stars, 200);
  assert.equal(PRO.stars, 200);
  await invoiceEndpoint({}, ctx(OTHER));
  assert.equal(sent(take(), 'createInvoiceLink')[0].params.prices[0].amount, 200);                    // счёт уже по новой цене
  assert.equal((await feedEndpoint({ type: 'deleted' }, ctx(OWNER))).items.length, 1);                // и новый лимит ленты
  await msg(50, { text: '/start' });
  assert.ok(userRow(50).pro_until <= now());                                                         // пробный срок выключен
  take();
  for (const values of [{ stars: 0 }, { stars: 1.5 }, { hack: 1 }, { proDays: 1, freeDays: 5 }, {}]) {
    await assert.rejects(() => adminEndpoint({ action: 'settings', values }, admin));
  }
  assert.equal(PRO.stars, 200);                                                                      // неверные значения ничего не поменяли
  await adminEndpoint({ action: 'settings', values: before }, admin);
  assert.deepEqual([PRO.stars, LIMITS.freeFeed, PRO.trialDays], [before.stars, before.freeFeed, before.trialDays]);
});

await step('Блокировка: бот и приложение закрыты, сообщения не сохраняются; владельца заблокировать нельзя', async () => {
  const admin = ctx(OWNER_ID);
  const USER = 40;
  const data = await adminEndpoint({ action: 'ban', userId: USER, on: true }, admin);
  assert.equal(data.users.find((u) => u.id === USER).banned, true);
  await assert.rejects(() => chatsEndpoint({}, ctx(USER)), /закрыт/);
  await msg(USER, { text: '/start' });
  assert.match(texts(take()), /закрыт администратором/);
  await press(USER, 'pro');
  assert.equal(sent(take()).length, 0);
  const m = { business_connection_id: 'conn-new', message_id: 77, date: now(), chat: { id: 9, type: 'private', first_name: 'P' }, from: { id: 9, first_name: 'P' }, text: 'для заблокированного' };
  await onBizMessage(m);
  assert.equal(sqlite.prepare('select count(*) as n from messages where owner_id = ?').get(USER).n, 0);
  await assert.rejects(() => adminEndpoint({ action: 'ban', userId: OWNER_ID, on: true }, admin));
  await adminEndpoint({ action: 'ban', userId: USER, on: false }, admin);
  assert.equal((await chatsEndpoint({}, ctx(USER))).id, USER);
  take();
});

await step('Помощник (второй админ): видит панель, дарит Pro и блокирует, но без VIP, рассылки и настроек', async () => {
  const admin = ctx(OWNER_ID);
  const helper = ctx(OTHER);
  await assert.rejects(() => adminEndpoint({}, helper));
  await adminEndpoint({ action: 'role', userId: OTHER, on: true }, admin);
  const data = await adminEndpoint({}, helper);
  assert.equal(data.admin, true);
  assert.equal(data.boss, false);
  assert.equal(data.users.find((u) => u.id === OTHER).helper, true);
  assert.equal((await adminEndpoint({ action: 'pro', userId: 40, days: 30 }, helper)).users.find((u) => u.id === 40).pro, true);
  await adminEndpoint({ action: 'pro', userId: 40, days: 0 }, helper);
  for (const input of [{ action: 'vip', userId: 40, on: true }, { action: 'broadcast', text: 'x' }, { action: 'settings', values: { stars: 1 } },
    { action: 'role', userId: 40, on: true }]) {
    await assert.rejects(() => adminEndpoint(input, helper));
  }
  assert.equal(userRow(40).vip, 0);
  await msg(OTHER, { text: '/vip 40' });                                                             // и командой VIP не выдать
  assert.equal(userRow(40).vip, 0);
  await assert.rejects(() => adminEndpoint({ action: 'role', userId: OWNER_ID, on: false }, admin));  // владельца не разжаловать
  await adminEndpoint({ action: 'role', userId: OTHER, on: false }, admin);
  await assert.rejects(() => adminEndpoint({}, helper));
  take();
});

await step('Отчёт за неделю: одно сообщение при первом сообщении новой недели, только с Pro', async () => {
  const week = Math.floor((Math.floor((now() + 300 * 60) / 86400) + 3) / 7);
  const reset = () => sqlite.prepare('update users set report_week = ? where id = ?').run(week - 1, OWNER);
  const lastWeek = now() - 7 * 86400;
  for (let i = 0; i < 3; i++) {
    sqlite.prepare("insert into messages (conn_id, owner_id, chat_id, message_id, from_name, date, kind, text, deleted_at, kept) values ('c', ?, 1, ?, ?, ?, 'text', 'w', ?, 1)")
      .run(OWNER, 9000 + i, i ? 'Азиз' : 'Мадина', lastWeek, lastWeek);
  }
  setMode(OWNER, NOTIFY.off);
  reset();
  await onBizMessage(biz({ text: 'нед 1' }));
  assert.equal(take().length, 0);                                                                    // без Pro отчёта нет
  reset();
  givePro(OWNER);
  await onBizMessage(biz({ text: 'нед 2' }));
  const report = texts(take());
  assert.match(report, /Отчёт за прошлую неделю/);
  assert.match(report, /Удалено сообщений: 3/);
  assert.match(report, /🥇 Азиз — 2\n🥈 Мадина — 1/);
  await onBizMessage(biz({ text: 'нед 3' }));
  assert.equal(take().length, 0);                                                                    // второй раз за неделю не шлём
  reset();
  await settingsEndpoint({ weekly: false }, ctx(OWNER));
  await onBizMessage(biz({ text: 'нед 4' }));
  assert.equal(take().length, 0);                                                                    // выключено в профиле
  await settingsEndpoint({ weekly: true }, ctx(OWNER));
  sqlite.prepare("delete from messages where text like 'нед %' or text = 'w'").run();
  givePro(OWNER, 0);
  setMode(OWNER, NOTIFY.full);
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

await step('С Pro: фото и голосовое открываются прямо в мини-приложении', async () => {
  assert.equal(base64(new Uint8Array([72, 105, 33])), 'SGkh');
  assert.equal(base64(new Uint8Array([72, 105])), 'SGk=');
  assert.equal(base64(new Uint8Array([72])), 'SA==');
  assert.deepEqual([...utf8('Я😀')], [...Buffer.from('Я😀')]);
  const { items } = await feedEndpoint({ type: 'deleted' }, ctx(OWNER));
  const voice = items.find((i) => i.kind === 'voice');
  const photo = items.find((i) => i.kind === 'photo');
  assert.deepEqual(await mediaEndpoint({ id: voice.id }, ctx(OWNER)), { mime: 'audio/ogg', data: 'SGkh', part: 0, parts: 1, size: 3 });
  assert.equal((await mediaEndpoint({ id: photo.id }, ctx(OWNER))).mime, 'image/jpeg');
  assert.equal(sent(take(), 'getFileStream')[0].params, 'voice-1');
  await assert.rejects(() => mediaEndpoint({ id: voice.id }, ctx(OTHER)));        // чужой файл
  await assert.rejects(() => mediaEndpoint({ id: voice.id, thumb: true }, ctx(OWNER))); // превью нет
  sqlite.prepare("update messages set meta = ? where id = ?").run(JSON.stringify({ size: LIMITS.inlineMedia + 1 }), voice.id);
  await assert.rejects(() => mediaEndpoint({ id: voice.id }, ctx(OWNER)));        // слишком большой
  sqlite.prepare('update messages set meta = null where id = ?').run(voice.id);
  failures.fileSize = LIMITS.inlineMedia + 1;                                     // размер неизвестен заранее, но Telegram говорит: большой
  await assert.rejects(() => mediaEndpoint({ id: voice.id }, ctx(OWNER)), /больше 20 МБ/);
  failures.fileSize = null;
  failures.rule = (method) => (method === 'getFileStream' ? new BotApiError(method, 400, 'file is too old') : undefined);
  await assert.rejects(() => mediaEndpoint({ id: voice.id }, ctx(OWNER)));        // Telegram файл уже не отдаёт
});

await step('Документы (PDF, Excel и любые файлы) сохраняются с именем и размером и приходят в чат', async () => {
  const m = biz({ document: { file_id: 'doc-1', file_name: 'Отчёт 2026.xlsx', file_size: 52_000_000,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', thumbnail: { file_id: 'doc-thumb' } }, caption: 'смета' });
  await onBizMessage(m);
  await del([m.message_id]);
  take();
  const { items } = await feedEndpoint({ type: 'deleted', chatId: FRIEND }, ctx(OWNER));
  const doc = items.find((i) => i.kind === 'document');
  assert.equal(doc.meta.fileName, 'Отчёт 2026.xlsx');
  assert.equal(doc.meta.size, 52_000_000);
  assert.equal(doc.hasThumb, true);
  assert.doesNotMatch(JSON.stringify(doc), /doc-thumb|doc-1/);                    // ссылки на файлы наружу не уходят
  await assert.rejects(() => mediaEndpoint({ id: doc.id }, ctx(OWNER)), /больше 20 МБ/); // 52 МБ в приложение не качаем
  assert.equal(sent(take(), 'getFileStream').length, 0);                          // и даже не начинаем
  assert.equal((await mediaEndpoint({ id: doc.id, thumb: true }, ctx(OWNER))).mime, 'image/jpeg');
  await sendMediaEndpoint({ id: doc.id }, ctx(OWNER));                            // а в чат файл приходит любого размера
  assert.equal(sent(take(), 'sendDocument')[0].params.document, 'doc-1');
  sqlite.prepare('delete from messages where message_id = ?').run(m.message_id);
});

await step('При правке заменили файл → прежний файл не теряется', async () => {
  const m = biz({ photo: [{ file_id: 'old-photo' }], caption: 'было фото' });
  await onBizMessage(m);
  await onBizEdited({ ...m, photo: undefined, video: { file_id: 'new-video' }, caption: 'стало видео', edit_date: m.date + 60 });
  take();
  const { items } = await feedEndpoint({ type: 'edited', chatId: FRIEND }, ctx(OWNER));
  const item = items.find((i) => i.text === 'стало видео');
  assert.equal(item.kind, 'video');
  assert.equal(item.editedAt, m.date + 60);                                       // время правки — от Telegram
  const [v] = item.versions;
  assert.deepEqual([v.text, v.kind, v.hasFile], ['было фото', 'photo', true]);
  assert.equal((await mediaEndpoint({ id: item.id, edit: v.id }, ctx(OWNER))).mime, 'image/jpeg');
  assert.equal(sent(take(), 'getFileStream')[0].params, 'old-photo');
  await sendMediaEndpoint({ id: item.id, edit: v.id }, ctx(OWNER));
  assert.equal(sent(take(), 'sendDocument')[0].params.document.name.endsWith('.jpg'), true);     // прежнее фото — тоже файлом
  await assert.rejects(() => mediaEndpoint({ id: item.id, edit: 999999 }, ctx(OWNER)));
  givePro(OTHER);
  await assert.rejects(() => mediaEndpoint({ id: item.id, edit: v.id }, ctx(OTHER))); // чужая правка
  givePro(OTHER, 0);
  sqlite.prepare("delete from edits where msg_id in (select id from messages where message_id = ?)").run(m.message_id);
  sqlite.prepare('delete from messages where message_id = ?').run(m.message_id);
});

await step('Часы Telegram спешат → «удалено» не раньше, чем «отправлено»', async () => {
  const m = { ...biz({ text: 'из будущего' }), date: now() + 90 };
  await onBizMessage(m);
  await del([m.message_id]);
  take();
  const { items } = await feedEndpoint({ type: 'deleted', chatId: FRIEND }, ctx(OWNER));
  const item = items.find((i) => i.text === 'из будущего');
  assert.ok(item.deletedAt >= item.date);
  sqlite.prepare('delete from messages where message_id = ?').run(m.message_id);
});

await step('Качество: из размеров фото берём самый большой; файл едет в приложение частями и без изменений', async () => {
  // Размеры пришли в необычном порядке — всё равно должен выбраться самый большой.
  const m = biz({ photo: [{ file_id: 'q-hd', width: 2560, height: 1440, file_size: 900_000 }, { file_id: 'q-s', width: 90, height: 50, file_size: 2000 },
    { file_id: 'q-m', width: 320, height: 180, file_size: 20_000 }] });
  await onBizMessage(m);
  await del([m.message_id]);
  take();
  const { items } = await feedEndpoint({ type: 'deleted', chatId: FRIEND }, ctx(OWNER));
  const photo = items.find((i) => i.meta?.dim === '2560×1440');
  assert.equal(photo.meta.size, 900_000);
  await mediaEndpoint({ id: photo.id }, ctx(OWNER));
  assert.equal(sent(take(), 'getFileStream')[0].params, 'q-hd');
  // Части: файл «Hi!» (3 байта) режем по 2 байта → две части, вместе дают исходные байты.
  const chunk = LIMITS.mediaChunk;
  LIMITS.mediaChunk = 2;
  const a = await mediaEndpoint({ id: photo.id }, ctx(OWNER));
  const b = await mediaEndpoint({ id: photo.id, part: 1 }, ctx(OWNER));
  const c = await mediaEndpoint({ id: photo.id, part: 5 }, ctx(OWNER));
  LIMITS.mediaChunk = chunk;
  assert.deepEqual([a.parts, a.size, a.part, b.part], [2, 3, 0, 1]);
  assert.equal(Buffer.concat([Buffer.from(a.data, 'base64'), Buffer.from(b.data, 'base64')]).toString(), 'Hi!');
  assert.equal(c.data, '');                                                                          // части за концом файла пустые
  take();
  sqlite.prepare("delete from messages where file_id = 'q-hd'").run();
});

await step('«Получить файл»: фото и видео приходят файлом без сжатия; большие и при сбое — обычной пересылкой', async () => {
  const add = async (extra) => { const m = biz(extra); await onBizMessage(m); await del([m.message_id]); take(); return m; };
  const find = async (fileKind) => (await feedEndpoint({ type: 'deleted', chatId: FRIEND }, ctx(OWNER))).items.filter((i) => i.kind === fileKind).at(0);
  const p = await add({ photo: [{ file_id: 'f-photo', width: 1280, height: 720, file_size: 500_000 }] });
  const res = await sendMediaEndpoint({ id: (await find('photo')).id }, ctx(OWNER));
  let out = take();
  assert.equal(res.asFile, true);
  assert.match(res.message, /без сжатия/);
  assert.equal(sent(out, 'sendPhoto').length, 0);                                                    // не «как фото»
  const doc = sent(out, 'sendDocument')[0].params;
  assert.equal(doc.chat_id, OWNER);
  assert.equal(doc.disable_content_type_detection, true);
  assert.match(doc.document.name, /^photo_\d{8}_\d{4}\.jpg$/);
  assert.equal(Buffer.from(doc.document.bytes).toString(), 'Hi!');                                   // те же байты, что отдал Telegram
  // Видео: имя и тип берём из самого файла.
  await add({ video: { file_id: 'f-video', file_name: 'IMG_0042.MOV', mime_type: 'video/quicktime', file_size: 9_000_000 } });
  await sendMediaEndpoint({ id: (await find('video')).id }, ctx(OWNER));
  const vid = sent(take(), 'sendDocument')[0].params.document;
  assert.deepEqual([vid.name, vid.options.type], ['IMG_0042.MOV', 'video/quicktime']);
  // Больше 20 МБ скачать нельзя → пересылаем по ссылке как видео (качество то же).
  await add({ video: { file_id: 'f-big', file_size: LIMITS.asFileMax + 1 } });
  const big = await sendMediaEndpoint({ id: (await find('video')).id }, ctx(OWNER));
  out = take();
  assert.equal(big.asFile, false);
  assert.equal(sent(out, 'getFileContent').length, 0);
  assert.equal(sent(out, 'sendVideo')[0].params.video, 'f-big');
  // Скачать не вышло → тоже обычная пересылка, а не ошибка.
  failures.rule = (method) => (method === 'getFileContent' ? new BotApiError(method, 400, 'file is too big') : undefined);
  const fallback = await sendMediaEndpoint({ id: (await find('photo')).id }, ctx(OWNER));
  failures.rule = null;
  assert.equal(fallback.asFile, false);
  assert.equal(sent(take(), 'sendPhoto')[0].params.photo, 'f-photo');
  sqlite.prepare("delete from messages where file_id like 'f-%'").run();
  assert.ok(p);
});

await step('С Pro: выгрузка переписки с собеседником приходит файлом', async () => {
  const res = await exportEndpoint({ chatId: FRIEND }, ctx(OWNER));
  const doc = sent(take(), 'sendDocument')[0].params;
  assert.equal(doc.chat_id, OWNER);
  const text = Buffer.from(doc.document.bytes).toString();
  assert.ok(res.count >= 3);
  assert.match(text, /Friend: приду в 7/);
  assert.match(text, /Было \(.+\): приду в 5/);
  assert.match(text, /🗑 \d{4}-\d\d-\d\d/);
  await assert.rejects(() => exportEndpoint({ chatId: 12345 }, ctx(OWNER)));
  givePro(OTHER, 0);
  await assert.rejects(() => exportEndpoint({ chatId: FRIEND }, ctx(OTHER)));
});

await step('Оплата из мини-приложения: ссылка на счёт', async () => {
  givePro(OTHER, 0);
  const res = await invoiceEndpoint({}, ctx(OTHER));
  assert.equal(res.pro, false);
  assert.equal(sent(take(), 'createInvoiceLink')[0].params.subscription_period, PRO.periodSeconds);
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
  assert.equal((await chatsEndpoint({}, ctx(OWNER))).chats.length, 0);
  await settingsEndpoint({ wipe: true }, ctx(OWNER)); // то же из мини-приложения — не падает на пустой базе
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
