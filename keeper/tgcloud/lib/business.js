// lib/business.js — общее для обработчиков сообщений из чатов пользователя.

import { api, BotApiError } from 'sdk';
import { getConnection, saveConnection, getUser } from './store.js';

// Находит подключение и его владельца. Возвращает null, если бот отключён.
export async function ownerOf(connectionId) {
  let conn = await getConnection(connectionId);
  if (!conn) {
    // Подключение создано до того, как бот начал их записывать — спрашиваем у Telegram.
    try {
      conn = await saveConnection(await api.getBusinessConnection({ business_connection_id: connectionId }));
    } catch (e) {
      if (e instanceof BotApiError) return null;
      throw e;
    }
  }
  if (!conn?.enabled) return null;
  const user = await getUser({ id: conn.userId });
  if (user.banned) return null; // заблокированным бот ничего не сохраняет и не присылает
  return { conn, user };
}
