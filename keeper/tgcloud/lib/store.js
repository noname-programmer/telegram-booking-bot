// lib/store.js — вся работа с базой данных.
// Обработчики (handlers) и endpoints не пишут запросы сами, а вызывают функции отсюда.

import { db } from 'sdk';
import { eq, and, asc, desc, inArray, isNotNull, sql } from 'sdk/db';
import { users, connections, messages, edits, payments } from '../schema.js';
import { LIMITS } from './config.js';
import { pickLang } from './i18n.js';

export const now = () => Math.floor(Date.now() / 1000);
const DAY = 24 * 60 * 60;

// ---------- пользователи ----------

// Находит пользователя или создаёт нового (язык берём из его Telegram).
export async function getUser(tgUser) {
  const found = await db.select().from(users).where(eq(users.id, tgUser.id)).get();
  if (found) return found;
  const row = { id: tgUser.id, lang: pickLang(tgUser.language_code), proUntil: 0, created: now() };
  await db.insert(users).values(row).onConflictDoNothing({ target: users.id }).run();
  return row;
}

export const isPro = (user) => user.proUntil > now();

export async function setLang(userId, lang) {
  await db.update(users).set({ lang }).where(eq(users.id, userId)).run();
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
  return { kind: 'other', text, fileId: null };
}

export const displayName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.title || '?';

// Сохраняет сообщение собеседника. Защищённый от копирования контент не сохраняем.
export async function saveMessage(conn, m) {
  if (m.has_protected_content) return;
  const d = describe(m);
  await db.insert(messages).values({
    connId: conn.id, ownerId: conn.userId, chatId: m.chat.id, messageId: m.message_id,
    fromName: displayName(m.from ?? m.chat), date: m.date ?? now(), ...d,
  }).onConflictDoNothing().run();
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
    await db.update(messages).set({ deletedAt: now() }).where(inArray(messages.id, rows.map((r) => r.id))).run();
  }
  return rows;
}

// Запоминает старый текст и записывает новый. Возвращает false, если ничего не поменялось.
export async function recordEdit(row, m) {
  const d = describe(m);
  if (d.text === row.text && d.fileId === row.fileId) return false;
  const at = now();
  await db.insert(edits).values({ msgId: row.id, ownerId: row.ownerId, oldText: row.text, at }).run();
  await db.update(messages).set({ ...d, editedAt: at }).where(eq(messages.id, row.id)).run();
  return d;
}

// ---------- история для мини-приложения ----------

export async function feed(ownerId, type, limit) {
  const col = type === 'edited' ? messages.editedAt : messages.deletedAt;
  const rows = await db.select().from(messages)
    .where(and(eq(messages.ownerId, ownerId), isNotNull(col)))
    .orderBy(desc(col)).limit(limit).all();
  if (type !== 'edited' || !rows.length) return rows.map((r) => ({ ...r, versions: [] }));
  const history = await db.select().from(edits)
    .where(inArray(edits.msgId, rows.map((r) => r.id))).orderBy(asc(edits.id)).all();
  return rows.map((r) => ({ ...r, versions: history.filter((e) => e.msgId === r.id).map((e) => e.oldText) }));
}

export async function getOwnMessage(ownerId, id) {
  return db.select().from(messages).where(and(eq(messages.id, id), eq(messages.ownerId, ownerId))).get();
}

// ---------- удаление данных ----------

// Удаляет все сохранённые сообщения пользователя.
export async function wipeUser(ownerId) {
  await db.delete(edits).where(eq(edits.ownerId, ownerId)).run();
  await db.delete(messages).where(eq(messages.ownerId, ownerId)).run();
}

// Стирает устаревшие записи: у бесплатных — старше freeDays, у всех — старше proDays.
// На платформе нет расписания, поэтому вызывается время от времени при новых сообщениях.
export async function cleanup() {
  const t = now();
  const proCut = t - LIMITS.proDays * DAY;
  const freeCut = t - LIMITS.freeDays * DAY;
  const old = sql`date < ${proCut} or (date < ${freeCut} and owner_id not in (select id from users where pro_until > ${t}))`;
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
    pro: await one(sql`select count(*) as n from users where pro_until > ${t}`),
    msgs: await one(sql`select count(*) as n from messages`),
    stars: await one(sql`select coalesce(sum(stars), 0) as n from payments`),
  };
}
