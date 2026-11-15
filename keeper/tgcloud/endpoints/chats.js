// endpoints/chats.js — список собеседников для главного экрана мини-приложения:
// имя, счётчики удалений и правок, время последнего события.

import { listChats } from '../lib/store.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, profile } = await whoami(ctx);
  const rows = await listChats(user.id);
  return {
    ...profile,
    chats: rows.map((c) => ({
      chatId: c.chatId, name: c.name, username: c.username, saved: c.saved, deleted: c.deleted, edited: c.edited,
      muted: Boolean(c.muted), firstAt: c.firstAt, lastAt: c.lastAt, eventAt: c.eventAt,
    })),
  };
}
