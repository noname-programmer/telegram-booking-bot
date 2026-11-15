// lib/store.js — вся работа с базой данных.
// Обработчики (handlers) и endpoints не пишут запросы сами, а вызывают функции отсюда.

import { db } from 'sdk';
import { eq, and, or, gt, asc, desc, inArray, isNotNull, sql } from 'sdk/db';
import { users, connections, chats, messages, edits, payments } from '../schema.js';
import { LIMITS, PRO, OWNER_ID } from './config.js';
import { pickLang } from './i18n.js';

export const now = () => Math.floor(Date.now() / 1000);
const DAY = 24 * 60 * 60;

// ---------- пользователи ----------

// Находит пользователя или создаёт нового (язык берём из его Telegram).
// Заодно обновляет имя, один раз выдаёт пробный Pro и следит, чтобы у владельца был VIP.
export async function getUser(tgUser) {
  const real = Boolean(tgUser.first_name); // настоящие данные из Telegram, а не одна только цифра ID
  const name = real ? displayName(tgUser) : '';
  const username = tgUser.username ?? '';
  let found = await db.select().from(users).where(eq(users.id, tgUser.id)).get();
  if (!found) {
    found = {
      id: tgUser.id, lang: pickLang(tgUser.language_code), proUntil: 0, name, username,
      notify: 0, favOnly: 0, vip: 0, trial: 0, tz: 300, refBy: null, refDone: 0,
      digestDay: 0, digestDel: 0, digestEd: 0, created: now(),
    };
    await db.insert(users).values(found).onConflictDoNothing({ target: users.id }).run();
  }
  const patch = {};
  if (real && (found.name !== name || found.username !== username)) Object.assign(patch, { name, username });
  if (real && !found.trial) {
    patch.trial = 1;
    // Строку могли создать заранее (например, выдали VIP по ID) — тогда язык ещё не настоящий.
    if (!found.name) patch.lang = pickLang(tgUser.language_code);
    patch.proUntil = Math.max(found.proUntil, now() + PRO.trialDays * DAY);
  }
  if (found.id === OWNER_ID && !found.vip) patch.vip = 1;
  if (Object.keys(patch).length) {
    await db.update(users).set(patch).where(eq(users.id, found.id)).run();
    Object.assign(found, patch);
  }
  return found;
}

// Pro есть у тех, кто оплатил (или на пробном сроке), и у всех с VIP.
export const isPro = (user) => Boolean(user.vip) || user.proUntil > now();

// Меняет настройки пользователя: { notify, favOnly, tz, lang }.
export async function setPrefs(userId, patch) {
  if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, userId)).run();
}

export async function setLang(userId, lang) {
  await db.update(users).set({ lang }).where(eq(users.id, userId)).run();
}

export async function setNotify(userId, mode) {
  await setPrefs(userId, { notify: Number(mode) || 0 });
}

// Прибавляет дни Pro к уже оплаченному сроку. Возвращает новую дату окончания.
export async function addProDays(userId, days) {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const proUntil = Math.max(now(), user.proUntil) + Math.floor(days) * DAY;
  await db.update(users).set({ proUntil }).where(eq(users.id, userId)).run();
  return proUntil;
}

// ---------- приглашения ----------

// Запоминает, кто пригласил пользователя. Только один раз и только до подключения бота.
export async function setReferrer(user, refId) {
  if (user.refBy || user.refDone || refId === user.id) return false;
  if (await hasAnyConnection(user.id)) return false;
  const inviter = await db.select().from(users).where(eq(users.id, refId)).get();
  if (!inviter) return false;
  await setPrefs(user.id, { refBy: refId });
  user.refBy = refId;
  return true;
}

// Приглашённый подключил бота: один раз начисляем награду пригласившему. Возвращает его или null.
export async function completeReferral(user, days) {
  if (!user.refBy || user.refDone) return null;
  await setPrefs(user.id, { refDone: 1 });
  user.refDone = 1;
  const until = await addProDays(user.refBy, days);
  if (!until) return null;
  return db.select().from(users).where(eq(users.id, user.refBy)).get();
}

export async function countReferrals(userId) {
  return db.$count(users, and(eq(users.refBy, userId), eq(users.refDone, 1)));
}

// ---------- сводка раз в день ----------

// Учитывает событие в дневной сводке. Если это первое событие за новый день,
// возвращает счётчики прошлого дня (чтобы бот написал одно сообщение), иначе null.
export async function digestTick(user, field, n = 1) {
  const day = Math.floor((now() + user.tz * 60) / DAY);
  const fresh = user.digestDay !== day;
  const prev = { deleted: user.digestDel, edited: user.digestEd };
  const next = {
    digestDay: day,
    digestDel: (fresh ? 0 : user.digestDel) + (field === 'deleted' ? n : 0),
    digestEd: (fresh ? 0 : user.digestEd) + (field === 'edited' ? n : 0),
  };
  await setPrefs(user.id, next);
  Object.assign(user, next);
  return fresh ? prev : null;
}

// Записывает оплату и включает Pro. Повторное уведомление о том же платеже ничего не меняет.
export async function grantPro(userId, until, chargeId, stars) {
  const seen = await db.select().from(payments).where(eq(payments.chargeId, chargeId)).get();
  if (seen) return false;
  await db.insert(payments).values({ chargeId, userId, stars, at: now() }).run();
  await db.update(users).set({ proUntil: until }).where(eq(users.id, userId)).run();
  return true;
}

// ---------- подключения ----------

export async function saveConnection(bc) {
  const row = {
    id: bc.id, userId: bc.user.id, userChatId: bc.user_chat_id,
    enabled: bc.is_enabled ? 1 : 0, updated: now(),
  };
  await db.insert(connections).values(row)
    .onConflictDoUpdate({ target: connections.id, set: { enabled: row.enabled, userChatId: row.userChatId, updated: row.updated } })
    .run();
  return row;
}

export async function getConnection(id) {
  return db.select().from(connections).where(eq(connections.id, id)).get();
}

export async function hasActiveConnection(userId) {
  const row = await db.select().from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.enabled, 1))).get();
  return Boolean(row);
}

export async function hasAnyConnection(userId) {
  return Boolean(await db.select().from(connections).where(eq(connections.userId, userId)).get());
}

// ---------- сообщения ----------

const MEDIA = ['video', 'video_note', 'voice', 'audio', 'document', 'animation', 'sticker'];

// Что это за сообщение: вид, текст и ссылка на файл.
export function describe(m) {
  if (typeof m.text === 'string') return { kind: 'text', text: m.text, fileId: null };
  const text = m.caption ?? '';
  if (Array.isArray(m.photo) && m.photo.length) return { kind: 'photo', text, fileId: m.photo.at(-1).file_id };
  // GIF приходит сразу как animation и document — проверяем animation раньше.
  if (m.animation) return { kind: 'animation', text, fileId: m.animation.file_id };
  for (const kind of MEDIA) {
    if (m[kind]?.file_id) return { kind, text, fileId: m[kind].file_id };
  }
  // Контакт, точка на карте, опрос: файла нет, но суть можно записать текстом.
  if (m.contact) return { kind: 'other', text: [m.contact.first_name, m.contact.last_name, m.contact.phone_number].filter(Boolean).join(' '), fileId: null };
  if (m.venue) return { kind: 'other', text: [m.venue.title, m.venue.address].filter(Boolean).join(', '), fileId: null };
  if (m.location) return { kind: 'other', text: `${m.location.latitude}, ${m.location.longitude}`, fileId: null };
  if (m.poll) return { kind: 'other', text: m.poll.question ?? '', fileId: null };
  if (m.dice) return { kind: 'other', text: `${m.dice.emoji ?? ''} ${m.dice.value ?? ''}`.trim(), fileId: null };
  return { kind: 'other', text, fileId: null };
}

// Подробности о сообщении для мини-приложения: размер и длительность файла, пересылка и т. п.
// Возвращает строку JSON или null, если добавить нечего.
export function details(m) {
  const meta = {};
  const file = (Array.isArray(m.photo) && m.photo.at(-1)) || m.animation || MEDIA.map((k) => m[k]).find(Boolean);
  if (file) {
    if (file.file_size) meta.size = file.file_size;
    if (file.duration) meta.duration = file.duration;
    if (file.file_name) meta.fileName = String(file.file_name).slice(0, 120);
    if (file.mime_type) meta.mime = file.mime_type;
    if (file.width && file.height) meta.dim = `${file.width}×${file.height}`;
    if (file.emoji) meta.emoji = file.emoji;
    if (file.thumbnail?.file_id) meta.thumb = file.thumbnail.file_id; // маленькая картинка-превью
    if (m.sticker) meta.sticker = file.is_video ? 'video' : file.is_animated ? 'animated' : 'static';
    if (file.title || file.performer) meta.title = [file.performer, file.title].filter(Boolean).join(' — ').slice(0, 120);
  }
  const origin = m.forward_origin;
  if (origin) {
    meta.forward = displayName(origin.sender_user ?? origin.chat ?? origin.sender_chat)
      .replace(/^\?$/, '') || origin.sender_user_name || '?';
  }
  if (m.reply_to_message) meta.reply = true; // сам текст, на который ответили, не храним: он может быть вашим
  if (m.via_bot?.username) meta.viaBot = m.via_bot.username;
  if (m.media_group_id) meta.album = true;
  if (m.has_media_spoiler) meta.spoiler = true;
  if (m.contact) meta.type = 'contact';
  else if (m.venue || m.location) meta.type = 'location';
  else if (m.poll) meta.type = 'poll';
  else if (m.dice) meta.type = 'dice';
  const links = (m.entities ?? m.caption_entities ?? []).filter((e) => e.type === 'url' || e.type === 'text_link').length;
  if (links) meta.links = links;
  return Object.keys(meta).length ? JSON.stringify(meta) : null;
}

export const displayName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.title || '?';

// Сохраняет сообщение собеседника. Защищённый от копирования контент не сохраняем.
export async function saveMessage(conn, m) {
  if (m.has_protected_content) return;
  const d = describe(m);
  await db.insert(messages).values({
    connId: conn.id, ownerId: conn.userId, chatId: m.chat.id, messageId: m.message_id,
    fromName: displayName(m.from ?? m.chat), fromId: m.from?.id ?? null, username: m.from?.username ?? null,
    date: m.date ?? now(), ...d, meta: details(m),
  }).onConflictDoNothing().run();
}

// ---------- чаты (собеседники) ----------

export async function getChat(ownerId, chatId) {
  return db.select().from(chats).where(and(eq(chats.ownerId, ownerId), eq(chats.chatId, chatId))).get();
}

// Отмечает новое сообщение в чате: создаёт строку собеседника, если её нет, и обновляет имя и счётчик.
export async function touchChat(ownerId, chat, date) {
  const at = date ?? now();
  const name = displayName(chat);
  const username = chat.username ?? '';
  if (!(await getChat(ownerId, chat.id))) {
    await db.insert(chats).values({ ownerId, chatId: chat.id, name, username, firstAt: at, lastAt: at })
      .onConflictDoNothing().run();
  }
  await db.run(sql`update chats set saved = saved + 1, name = ${name}, username = ${username}, last_at = ${at}
    where owner_id = ${ownerId} and chat_id = ${chat.id}`);
}

// Прибавляет к счётчику чата удаления или правки. field: 'deleted' | 'edited'.
export async function countEvent(ownerId, chatId, field, n = 1) {
  const at = now();
  if (field === 'deleted') {
    await db.run(sql`update chats set deleted = deleted + ${n}, event_at = ${at} where owner_id = ${ownerId} and chat_id = ${chatId}`);
  } else {
    await db.run(sql`update chats set edited = edited + ${n}, event_at = ${at} where owner_id = ${ownerId} and chat_id = ${chatId}`);
  }
}

export async function setFav(ownerId, chatId, fav) {
  await db.update(chats).set({ fav: fav ? 1 : 0 }).where(and(eq(chats.ownerId, ownerId), eq(chats.chatId, chatId))).run();
}

export async function setMuted(ownerId, chatId, muted) {
  await db.update(chats).set({ muted: muted ? 1 : 0 }).where(and(eq(chats.ownerId, ownerId), eq(chats.chatId, chatId))).run();
}

// Список собеседников: сначала те, у кого недавно что-то удалили или изменили.
export async function listChats(ownerId) {
  const rows = await db.select().from(chats).where(eq(chats.ownerId, ownerId)).all();
  return rows.sort((a, b) => (b.eventAt - a.eventAt) || (b.lastAt - a.lastAt)).slice(0, 300);
}

export async function findMessage(connId, chatId, messageId) {
  return db.select().from(messages)
    .where(and(eq(messages.connId, connId), eq(messages.chatId, chatId), eq(messages.messageId, messageId))).get();
}

// Помечает сообщения удалёнными и возвращает те, что были у нас сохранены.
// Уже помеченные пропускаем: Telegram может прислать одно событие дважды, а уведомление нужно одно.
export async function markDeleted(connId, chatId, ids) {
  if (!ids.length) return [];
  const where = and(eq(messages.connId, connId), eq(messages.chatId, chatId), inArray(messages.messageId, ids));
  const all = await db.select().from(messages).where(where).orderBy(asc(messages.messageId)).all();
  const rows = all.filter((r) => r.deletedAt === null || r.deletedAt === undefined);
  if (rows.length) {
    // Часы Telegram и сервера могут расходиться на минуту: удалить раньше, чем отправить, нельзя.
    const at = Math.max(now(), ...rows.map((r) => r.date));
    await db.update(messages).set({ deletedAt: at }).where(inArray(messages.id, rows.map((r) => r.id))).run();
    for (const r of rows) r.deletedAt = at;
  }
  return rows;
}

// Запоминает старый текст и записывает новый. Возвращает false, если ничего не поменялось.
export async function recordEdit(row, m) {
  const d = describe(m);
  if (d.text === row.text && d.fileId === row.fileId) return false;
  // Время правки берём у Telegram; если его нет — своё. Раньше отправки оно быть не может.
  const at = Math.max(m.edit_date ?? now(), row.date);
  await db.insert(edits).values({
    msgId: row.id, ownerId: row.ownerId, oldText: row.text, oldKind: row.kind,
    oldFileId: d.fileId !== row.fileId ? row.fileId : null, // файл заменили — прежний не теряем
    at,
  }).run();
  await db.update(messages).set({ ...d, meta: details(m), editedAt: at }).where(eq(messages.id, row.id)).run();
  return d;
}

// ---------- история для мини-приложения ----------

// type: 'deleted' | 'edited' | 'all'; chatId — только один собеседник (или null — все).
// q — поиск по тексту сообщения.
export async function feed(ownerId, { type = 'all', chatId = null, q = '', limit }) {
  const base = [eq(messages.ownerId, ownerId)];
  if (chatId !== null) base.push(eq(messages.chatId, chatId));
  // Поиск делаем сами, а не в базе: база не умеет сравнивать русские буквы без учёта регистра.
  const needle = String(q).trim().toLowerCase().slice(0, 60);
  const pick = async (col) => {
    const rows = await db.select().from(messages).where(and(...base, isNotNull(col))).orderBy(desc(col))
      .limit(needle ? 1000 : limit).all();
    return needle ? rows.filter((r) => `${r.text}\n${r.fromName}`.toLowerCase().includes(needle)).slice(0, limit) : rows;
  };
  const eventAt = (r) => Math.max(r.deletedAt ?? 0, r.editedAt ?? 0);

  let rows;
  if (type === 'deleted') rows = await pick(messages.deletedAt);
  else if (type === 'edited') rows = await pick(messages.editedAt);
  else {
    // Сообщение могли и изменить, и удалить — в общей ленте показываем его один раз.
    const byId = new Map();
    for (const r of [...await pick(messages.deletedAt), ...await pick(messages.editedAt)]) byId.set(r.id, r);
    rows = [...byId.values()].sort((a, b) => eventAt(b) - eventAt(a)).slice(0, limit);
  }

  const changed = rows.filter((r) => r.editedAt).map((r) => r.id);
  const history = changed.length
    ? await db.select().from(edits).where(inArray(edits.msgId, changed)).orderBy(asc(edits.id)).all()
    : [];
  return rows.map((r) => ({
    ...r,
    at: type === 'deleted' ? r.deletedAt : type === 'edited' ? r.editedAt : eventAt(r),
    versions: history.filter((e) => e.msgId === r.id)
      .map((e) => ({ id: e.id, text: e.oldText, at: e.at, kind: e.oldKind ?? r.kind, hasFile: Boolean(e.oldFileId) })),
  }));
}

// Все сохранённые сообщения одного собеседника по порядку — для выгрузки в файл.
export async function chatHistory(ownerId, chatId, limit) {
  const rows = await db.select().from(messages)
    .where(and(eq(messages.ownerId, ownerId), eq(messages.chatId, chatId)))
    .orderBy(desc(messages.date)).limit(limit).all();
  rows.reverse();
  const changed = rows.filter((r) => r.editedAt).map((r) => r.id);
  const history = changed.length
    ? await db.select().from(edits).where(inArray(edits.msgId, changed)).orderBy(asc(edits.id)).all()
    : [];
  return rows.map((r) => ({ ...r, versions: history.filter((e) => e.msgId === r.id) }));
}

export async function getOwnMessage(ownerId, id) {
  return db.select().from(messages).where(and(eq(messages.id, id), eq(messages.ownerId, ownerId))).get();
}

// Файл для показа или отправки: сам файл сообщения либо прежний файл из правки (editId).
// Возвращает { kind, fileId, meta } или null. Чужую запись получить нельзя.
export async function getOwnFile(ownerId, id, editId = null) {
  const row = await getOwnMessage(ownerId, id);
  if (!row) return null;
  if (editId === null) return row.fileId ? { kind: row.kind, fileId: row.fileId, meta: row.meta } : null;
  const edit = await db.select().from(edits)
    .where(and(eq(edits.id, editId), eq(edits.msgId, row.id), eq(edits.ownerId, ownerId))).get();
  return edit?.oldFileId ? { kind: edit.oldKind ?? 'document', fileId: edit.oldFileId, meta: null } : null;
}

// ---------- удаление данных ----------

// Удаляет все сохранённые сообщения пользователя.
export async function wipeUser(ownerId) {
  await db.delete(edits).where(eq(edits.ownerId, ownerId)).run();
  await db.delete(messages).where(eq(messages.ownerId, ownerId)).run();
  await db.delete(chats).where(eq(chats.ownerId, ownerId)).run();
}

// Стирает устаревшие записи: у бесплатных — старше freeDays, у всех — старше proDays.
// На платформе нет расписания, поэтому вызывается время от времени при новых сообщениях.
export async function cleanup() {
  const t = now();
  const proCut = t - LIMITS.proDays * DAY;
  const freeCut = t - LIMITS.freeDays * DAY;
  const old = sql`date < ${proCut} or (date < ${freeCut} and owner_id not in (select id from users where pro_until > ${t} or vip = 1))`;
  await db.run(sql`delete from edits where at < ${proCut} or msg_id in (select id from messages where ${old})`);
  await db.run(sql`delete from messages where ${old}`);
}

// ---------- статистика для владельца ----------

export async function stats() {
  const t = now();
  const one = async (q) => Number((await db.get(q))?.n ?? 0);
  return {
    users: await one(sql`select count(*) as n from users`),
    conns: await one(sql`select count(*) as n from connections where enabled = 1`),
    pro: await one(sql`select count(*) as n from users where pro_until > ${t} or vip = 1`),
    msgs: await one(sql`select count(*) as n from messages`),
    stars: await one(sql`select coalesce(sum(stars), 0) as n from payments`),
  };
}

// ---------- аналитика пользователя ----------

const median = (list) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// tz — смещение часового пояса пользователя в минутах (у Ташкента +300), чтобы часы и дни были местными.
export async function analytics(ownerId, tz = 0) {
  const shift = Math.max(-840, Math.min(840, Number(tz) || 0)) * 60;
  const t = now();
  const list = await db.select().from(chats).where(eq(chats.ownerId, ownerId)).all();
  const totals = { chats: list.length, saved: 0, deleted: 0, edited: 0 };
  for (const c of list) { totals.saved += c.saved; totals.deleted += c.deleted; totals.edited += c.edited; }

  const rows = await db.select({
    date: messages.date, deletedAt: messages.deletedAt, editedAt: messages.editedAt, kind: messages.kind,
  }).from(messages)
    .where(and(eq(messages.ownerId, ownerId), or(isNotNull(messages.deletedAt), isNotNull(messages.editedAt))))
    .limit(5000).all();

  // Последние 14 дней по местному времени.
  const dayOf = (unix) => Math.floor((unix + shift) / DAY);
  const today = dayOf(t);
  const days = Array.from({ length: 14 }, (_, i) => ({ day: (today - 13 + i) * DAY, deleted: 0, edited: 0 }));
  const hours = Array(24).fill(0);
  const kinds = {};
  const life = [];
  for (const r of rows) {
    if (r.deletedAt) {
      const i = dayOf(r.deletedAt) - (today - 13);
      if (i >= 0 && i < 14) days[i].deleted++;
      hours[Math.floor(((r.deletedAt + shift) % DAY + DAY) % DAY / 3600)]++;
      kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
      if (r.deletedAt >= r.date) life.push(r.deletedAt - r.date);
    }
    if (r.editedAt) {
      const i = dayOf(r.editedAt) - (today - 13);
      if (i >= 0 && i < 14) days[i].edited++;
    }
  }
  const top = [...list].sort((a, b) => (b.deleted + b.edited) - (a.deleted + a.edited))
    .filter((c) => c.deleted + c.edited > 0).slice(0, 5)
    .map((c) => ({ chatId: c.chatId, name: c.name, username: c.username, saved: c.saved, deleted: c.deleted, edited: c.edited }));
  return {
    totals, days, hours, kinds, top,
    stored: await db.$count(messages, eq(messages.ownerId, ownerId)),
    life: { count: life.length, median: median(life), fastest: life.length ? Math.min(...life) : 0 },
  };
}

// ---------- админ-панель ----------
// Здесь только цифры и список пользователей. Тексты чужих сообщений админ не видит.

export async function adminOverview() {
  const t = now();
  const one = async (q) => Number((await db.get(q))?.n ?? 0);
  const totals = {
    ...(await stats()),
    chats: await one(sql`select count(*) as n from chats`),
    deleted: await one(sql`select coalesce(sum(deleted), 0) as n from chats`),
    edited: await one(sql`select coalesce(sum(edited), 0) as n from chats`),
    payments: await one(sql`select count(*) as n from payments`),
    vip: await one(sql`select count(*) as n from users where vip = 1`),
    refs: await one(sql`select count(*) as n from users where ref_done = 1`),
    // Воронка: сколько людей дошло до каждого шага.
    started: await one(sql`select count(*) as n from users where name <> ''`),
    everConnected: await one(sql`select count(distinct user_id) as n from connections`),
    paid: await one(sql`select count(distinct user_id) as n from payments`),
  };
  const today = Math.floor(t / DAY);
  const days = Array.from({ length: 14 }, (_, i) => ({ day: (today - 13 + i) * DAY, users: 0 }));
  const all = await db.select().from(users).orderBy(desc(users.created)).limit(1000).all();
  for (const u of all) {
    const i = Math.floor(u.created / DAY) - (today - 13);
    if (i >= 0 && i < 14) days[i].users++;
  }
  const active = new Set((await db.select().from(connections).where(eq(connections.enabled, 1)).all()).map((c) => c.userId));
  const usage = new Map();
  for (const c of await db.select().from(chats).limit(20000).all()) {
    const u = usage.get(c.ownerId) ?? { chats: 0, saved: 0, deleted: 0, edited: 0 };
    u.chats++; u.saved += c.saved; u.deleted += c.deleted; u.edited += c.edited;
    usage.set(c.ownerId, u);
  }
  return {
    totals, days,
    users: all.slice(0, 100).map((u) => ({
      id: u.id, name: u.name, username: u.username, lang: u.lang, created: u.created, notify: u.notify,
      proUntil: u.proUntil, pro: isPro(u), vip: Boolean(u.vip), owner: u.id === OWNER_ID,
      refBy: u.refBy ?? null, connected: active.has(u.id),
      ...(usage.get(u.id) ?? { chats: 0, saved: 0, deleted: 0, edited: 0 }),
    })),
    payments: await db.select().from(payments).orderBy(desc(payments.at)).limit(30).all(),
  };
}

// Подарить Pro на days дней (прибавляется к уже оплаченному) или снять его (days = 0).
export async function adminSetPro(userId, days) {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const proUntil = days > 0 ? Math.max(now(), user.proUntil) + Math.floor(days) * DAY : 0;
  await db.update(users).set({ proUntil }).where(eq(users.id, userId)).run();
  return { ...user, proUntil };
}

// Выдаёт или снимает бессрочный VIP. Если человек ещё не запускал бота, создаём для него строку заранее —
// VIP будет ждать его.
export async function adminSetVip(userId, on) {
  const user = await getUser({ id: userId });
  if (userId === OWNER_ID) return user; // у владельца VIP не снимается
  await setPrefs(userId, { vip: on ? 1 : 0 });
  return { ...user, vip: on ? 1 : 0 };
}

// Порция пользователей для рассылки: те, кто запускал бота, по возрастанию ID после after.
export async function broadcastBatch(after, limit) {
  return db.select().from(users).where(and(gt(users.id, after), sql`name <> ''`)).orderBy(asc(users.id)).limit(limit).all();
}
