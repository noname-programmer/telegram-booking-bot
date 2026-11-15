// endpoints/admin.js — админ-панель в мини-приложении. Доступна только тем, кто записан в ADMIN_IDS (lib/config.js).
// Показывает цифры и список пользователей; тексты чужих сообщений сюда не попадают.
//   {}                                         — общая сводка
//   { action: 'pro', userId, days }            — подарить Pro на days дней (0 — снять)

import { EndpointError } from 'sdk';
import { adminOverview, adminSetPro } from '../lib/store.js';
import { whoami, requireAdmin } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, profile } = await whoami(ctx);
  requireAdmin(user);
  if (input.action === 'pro') {
    const days = Number(input.days);
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw new EndpointError('Bad days', { code: 'BAD_INPUT' });
    const changed = await adminSetPro(Number(input.userId), days);
    if (!changed) throw new EndpointError('User not found', { code: 'NOT_FOUND' });
  }
  return { ...profile, ...(await adminOverview()) };
}
