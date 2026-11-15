// handlers/deleted_business_messages.js — в чате пользователя удалили сообщения.
// Telegram присылает только номера удалённых сообщений, поэтому текст берём из своей базы.

import { ownerOf } from '../lib/business.js';
import { markDeleted, countEvent, getChat } from '../lib/store.js';
import { LIMITS, NOTIFY } from '../lib/config.js';
import { announce, vaultCopy, clearAlert } from '../lib/ui.js';

export default async function onDeletedBusinessMessages(event) {
  const found = await ownerOf(event.business_connection_id);
  if (!found) return;
  const { conn, user } = found;

  const rows = await markDeleted(conn.id, event.chat.id, event.message_ids ?? []);
  if (!rows.length) return;
  await countEvent(conn.userId, event.chat.id, 'deleted', rows.length);

  // Удалённые файлы копируем в «сейф» (канал пользователя), пока Telegram их ещё отдаёт.
  for (const row of rows.filter((r) => r.fileId).slice(0, LIMITS.vaultPerEvent)) await vaultCopy(user, row);

  // Разом удалили очень много — отдельная тревога (приходит и в тихом режиме).
  const peer = await getChat(conn.userId, event.chat.id);
  const alerted = await clearAlert(user, conn.userChatId, peer, rows[0].fromName, (event.message_ids ?? []).length);

  // В мини-приложении запись уже есть. Писать ли ещё и в чат — зависит от режима уведомлений.
  // После тревоги короткое уведомление или сводка были бы повтором, поэтому шлём только в «полном» режиме.
  if (!alerted || user.notify === NOTIFY.full) await announce(user, conn.userChatId, peer, { type: 'deleted', rows });
}
