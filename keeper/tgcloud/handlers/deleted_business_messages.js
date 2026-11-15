// handlers/deleted_business_messages.js — в чате пользователя удалили сообщения.
// Telegram присылает только номера удалённых сообщений, поэтому текст берём из своей базы.

import { ownerOf } from '../lib/business.js';
import { markDeleted, countEvent, getChat } from '../lib/store.js';
import { announce } from '../lib/ui.js';

export default async function onDeletedBusinessMessages(event) {
  const found = await ownerOf(event.business_connection_id);
  if (!found) return;
  const { conn, user } = found;

  const rows = await markDeleted(conn.id, event.chat.id, event.message_ids ?? []);
  if (!rows.length) return;
  await countEvent(conn.userId, event.chat.id, 'deleted', rows.length);

  // В мини-приложении запись уже есть. Писать ли ещё и в чат — зависит от режима уведомлений.
  await announce(user, conn.userChatId, await getChat(conn.userId, event.chat.id), { type: 'deleted', rows });
}
