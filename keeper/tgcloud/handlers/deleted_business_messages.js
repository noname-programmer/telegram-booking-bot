// handlers/deleted_business_messages.js — в чате пользователя удалили сообщения.
// Telegram присылает только номера удалённых сообщений, поэтому текст берём из своей базы.

import { ownerOf } from '../lib/business.js';
import { LIMITS } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { markDeleted, countEvent, getChat } from '../lib/store.js';
import { send, esc, notifyDeleted } from '../lib/ui.js';

export default async function onDeletedBusinessMessages(event) {
  const found = await ownerOf(event.business_connection_id);
  if (!found) return;
  const { conn, user } = found;

  const rows = await markDeleted(conn.id, event.chat.id, event.message_ids ?? []);
  if (!rows.length) return;
  await countEvent(conn.userId, event.chat.id, 'deleted', rows.length);

  // Уведомления выключены целиком или для этого собеседника — запись всё равно видна в мини-приложении.
  if (!user.notify || (await getChat(conn.userId, event.chat.id))?.muted) return;

  // Удалили весь чат или много сообщений сразу — не засыпаем пользователя уведомлениями.
  const shown = rows.slice(0, LIMITS.notifyPerDelete);
  if (rows.length > shown.length) {
    await send(conn.userChatId, t(user.lang, 'deletedMany', { name: esc(rows[0].fromName), n: rows.length, shown: shown.length }));
  }
  for (const row of shown) await notifyDeleted(user, conn.userChatId, row);
}
