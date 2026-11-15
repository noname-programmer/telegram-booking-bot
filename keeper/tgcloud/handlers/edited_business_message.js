// handlers/edited_business_message.js — собеседник изменил сообщение.

import { ownerOf } from '../lib/business.js';
import { findMessage, recordEdit, saveMessage, countEvent, getChat } from '../lib/store.js';
import { announce, vaultCopy } from '../lib/ui.js';

export default async function onEditedBusinessMessage(message) {
  const found = await ownerOf(message.business_connection_id);
  if (!found) return;
  const { conn, user } = found;
  if (!message.from || message.from.id === conn.userId) return;

  const before = await findMessage(conn.id, message.chat.id, message.message_id);
  // Сообщение пришло до подключения бота — старого текста у нас нет, просто запоминаем новый.
  if (!before) return saveMessage(conn, message);

  const after = await recordEdit(before, message);
  if (!after) return;
  await countEvent(conn.userId, message.chat.id, 'edited');
  // При правке заменили файл — прежний копируем в «сейф».
  if (before.fileId && after.fileId !== before.fileId) await vaultCopy(user, before);
  await announce(user, conn.userChatId, await getChat(conn.userId, message.chat.id), { type: 'edited', before, after });
}
