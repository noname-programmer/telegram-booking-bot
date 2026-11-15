// handlers/business_message.js — новое сообщение в личном чате пользователя, подключившего бота.
// Бот ничего не отвечает в этот чат: он только запоминает сообщение собеседника.

import { ownerOf } from '../lib/business.js';
import { saveMessage, touchChat, cleanup } from '../lib/store.js';

export default async function onBusinessMessage(message) {
  const found = await ownerOf(message.business_connection_id);
  if (!found) return;
  const { conn } = found;
  // Свои сообщения владельца не храним — только собеседника.
  if (!message.from || message.from.id === conn.userId) return;
  await saveMessage(conn, message);
  // Отмечаем собеседника в списке чатов мини-приложения (имя и счётчик сообщений).
  await touchChat(conn.userId, message.chat, message.date);
  // Расписания на платформе нет, поэтому изредка заодно стираем устаревшие записи.
  if (message.message_id % 50 === 0) await cleanup();
}
