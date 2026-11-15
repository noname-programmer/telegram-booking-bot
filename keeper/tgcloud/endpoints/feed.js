// endpoints/feed.js — лента удалённых и изменённых сообщений для мини-приложения.
// Вызов: Telegram.WebApp.Serverless.call('feed', { type: 'all', chatId: 123 }, ...)
//   type:   'deleted' | 'edited' | 'all' (по умолчанию 'deleted')
//   chatId: показать только одного собеседника (не обязательно)

import { feed } from '../lib/store.js';
import { whoami, toItem } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, limit, profile } = await whoami(ctx);
  const type = ['edited', 'all'].includes(input.type) ? input.type : 'deleted';
  const chatId = Number.isFinite(Number(input.chatId)) && input.chatId !== null && input.chatId !== undefined
    ? Number(input.chatId) : null;
  const rows = await feed(user.id, { type, chatId, limit });
  return { ...profile, items: rows.map(toItem) };
}
