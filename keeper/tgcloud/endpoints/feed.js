// endpoints/feed.js — список удалённых или изменённых сообщений для мини-приложения.
// Вызов из мини-приложения: Telegram.WebApp.Serverless.call('feed', { type: 'deleted' }, ...)

import { LIMITS } from '../lib/config.js';
import { getUser, isPro, feed, hasActiveConnection } from '../lib/store.js';

export default async function (input, ctx) {
  const user = await getUser(ctx.initData.user); // пользователь проверен платформой
  const pro = isPro(user);
  const type = input.type === 'edited' ? 'edited' : 'deleted';
  const rows = await feed(user.id, type, pro ? LIMITS.proFeed : LIMITS.freeFeed);
  return {
    lang: user.lang,
    pro,
    proUntil: user.proUntil,
    connected: await hasActiveConnection(user.id),
    limit: pro ? LIMITS.proFeed : LIMITS.freeFeed,
    items: rows.map((r) => ({
      id: r.id, name: r.fromName, kind: r.kind, text: r.text, date: r.date,
      at: type === 'edited' ? r.editedAt : r.deletedAt,
      hasFile: Boolean(r.fileId),
      versions: r.versions,
    })),
  };
}
