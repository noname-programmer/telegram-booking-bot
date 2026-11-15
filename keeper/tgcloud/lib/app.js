// lib/app.js — общее для endpoints мини-приложения.

import { EndpointError } from 'sdk';
import { ADMIN_IDS, LIMITS, PRO } from './config.js';
import { getUser, isPro, hasActiveConnection } from './store.js';

export const isAdmin = (userId) => ADMIN_IDS.includes(userId);

// Кто открыл мини-приложение (пользователь проверен платформой) и что ему доступно.
export async function whoami(ctx) {
  const user = await getUser(ctx.initData.user);
  const pro = isPro(user);
  return {
    user,
    pro,
    limit: pro ? LIMITS.proFeed : LIMITS.freeFeed,
    profile: {
      id: user.id, lang: user.lang, pro, proUntil: user.proUntil, notify: Boolean(user.notify),
      connected: await hasActiveConnection(user.id), admin: isAdmin(user.id),
      limit: pro ? LIMITS.proFeed : LIMITS.freeFeed,
      freeDays: LIMITS.freeDays, proDays: LIMITS.proDays, stars: PRO.stars,
    },
  };
}

export function requireAdmin(user) {
  if (!isAdmin(user.id)) throw new EndpointError('Forbidden', { code: 'FORBIDDEN' });
}

// Запись истории в том виде, в каком её получает мини-приложение.
export function toItem(r) {
  let meta = null;
  try { meta = r.meta ? JSON.parse(r.meta) : null; } catch { meta = null; }
  return {
    id: r.id, chatId: r.chatId, name: r.fromName, username: r.username ?? '', fromId: r.fromId ?? null,
    kind: r.kind, text: r.text, date: r.date, at: r.at,
    deletedAt: r.deletedAt ?? null, editedAt: r.editedAt ?? null,
    hasFile: Boolean(r.fileId), versions: r.versions, meta,
  };
}
