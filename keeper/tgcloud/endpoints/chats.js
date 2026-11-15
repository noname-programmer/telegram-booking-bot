// endpoints/chats.js — список собеседников для главного экрана мини-приложения:
// имя, счётчики удалений и правок, время последнего события.
// input.tz — часовой пояс пользователя в минутах; запоминаем его для дневной сводки.

import { listChats, setPrefs } from '../lib/store.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, profile } = await whoami(ctx, input);
  const tz = Math.round(Number(input.tz));
  if (Number.isFinite(tz) && Math.abs(tz) <= 840 && tz !== user.tz) await setPrefs(user.id, { tz });
  const rows = await listChats(user.id);
  return {
    ...profile,
    chats: rows.map((c) => ({
      chatId: c.chatId, name: c.name, username: c.username, saved: c.saved, deleted: c.deleted, edited: c.edited,
      muted: Boolean(c.muted), fav: Boolean(c.fav), renamedAt: c.renamedAt, firstAt: c.firstAt, lastAt: c.lastAt, eventAt: c.eventAt,
    })),
  };
}
