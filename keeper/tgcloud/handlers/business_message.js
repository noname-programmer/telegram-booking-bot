// handlers/business_message.js — новое сообщение в личном чате пользователя, подключившего бота.
// Бот ничего не отвечает в этот чат: он только запоминает сообщение собеседника.

import { ownerOf } from '../lib/business.js';
import { saveMessage, touchChat, cleanup } from '../lib/store.js';
import { weeklyReport, proReminder } from '../lib/ui.js';

export default async function onBusinessMessage(message) {
  const found = await ownerOf(message.business_connection_id);
  if (!found) return;
  const { conn, user } = found;
  // Свои сообщения владельца не храним — только собеседника.
  if (!message.from || message.from.id === conn.userId) return;

  // touchChat наращивает счётчик, поэтому делаем это только при настоящей новой записи:
  // если Telegram повторит доставку апдетайта, saveMessage вернёт false и счётчик не задвоится.
  const fresh = await saveMessage(conn, message);
  if (fresh) await touchChat(conn.userId, message.chat, message.date);

  // Остальное — не критично для сохранения: если тут что-то временно сломается (например, Bot API),
  // не хотим ронять обработчик и вызывать повторную доставку. Поэтому каждое — отдельно и best-effort.
  await safe(() => message.message_id % 50 === 0 && cleanup()); // расписания нет — убираем старое изредка
  await safe(() => weeklyReport(user, conn.userChatId));         // отчёт при первом сообщении новой недели
  await safe(() => proReminder(user, conn.userChatId));          // напоминание, если Pro заканчивается завтра
}

async function safe(fn) {
  try { await fn(); } catch { /* best-effort: не мешаем сохранению сообщения */ }
}
