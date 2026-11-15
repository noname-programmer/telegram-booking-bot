// endpoints/feed.js — лента удалённых и изменённых сообщений для мини-приложения.
// Вызов: Telegram.WebApp.Serverless.call('feed', { type: 'all', chatId: 123, q: 'привет' }, ...)
//   type:   'deleted' | 'edited' | 'all' | 'media' (только фото и видео) | 'kept' (закладки); по умолчанию 'deleted'
//   chatId: показать только одного собеседника (не обязательно)
//   q:      поиск по тексту (не обязательно)

import { feed, chatNames, pinnedOf } from '../lib/store.js';
import { whoami, toItem } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, limit, profile } = await whoami(ctx, input);
  const type = ['edited', 'all', 'media', 'kept'].includes(input.type) ? input.type : 'deleted';
  const chatId = Number.isFinite(Number(input.chatId)) && input.chatId !== null && input.chatId !== undefined
    ? Number(input.chatId) : null;
  const q = typeof input.q === 'string' ? input.q : '';
  const rows = await feed(user.id, { type, chatId, q, limit });
  // На странице собеседника заодно отдаём его прежние имена.
  const names = chatId === null ? [] : (await chatNames(user.id, chatId)).map((n) => ({ name: n.name, username: n.username, at: n.at }));
  // …и закреплённые сообщения (они показываются вверху страницы, независимо от фильтра и поиска).
  const pinned = chatId === null ? [] : (await pinnedOf(user.id, chatId)).map(toItem);
  return { ...profile, items: rows.map(toItem), names, pinned };
}
