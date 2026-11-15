// endpoints/admin.js — админ-панель в мини-приложении. Доступна только тем, кто записан в ADMIN_IDS (lib/config.js).
// Показывает цифры и список пользователей; тексты чужих сообщений сюда не попадают.
//   {}                                         — общая сводка
//   { action: 'pro', userId, days }            — подарить Pro на days дней (0 — снять)
//   { action: 'vip', userId, on }              — выдать или снять бессрочный VIP
//   { action: 'broadcast', text, after }       — разослать сообщение порцией пользователей (after — ID, после которого продолжать)

import { EndpointError } from 'sdk';
import { LIMITS } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { adminOverview, adminSetPro, adminSetVip, broadcastBatch } from '../lib/store.js';
import { send, esc } from '../lib/ui.js';
import { whoami, requireAdmin } from '../lib/app.js';

const bad = (code) => new EndpointError(code, { code });

export default async function (input, ctx) {
  const { user, profile } = await whoami(ctx);
  requireAdmin(user);
  const userId = Number(input.userId);

  if (input.action === 'pro') {
    const days = Number(input.days);
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw bad('BAD_INPUT');
    if (!(await adminSetPro(userId, days))) throw bad('NOT_FOUND');
  }

  if (input.action === 'vip') {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw bad('BAD_INPUT');
    const target = await adminSetVip(userId, Boolean(input.on));
    if (input.on) await send(userId, t(target.lang, 'vipGiven')); // не дойдёт, если человек ещё не запускал бота — это не ошибка
  }

  if (input.action === 'broadcast') {
    const text = String(input.text ?? '').trim();
    if (!text || text.length > LIMITS.textMax) throw bad('BAD_INPUT');
    const batch = await broadcastBatch(Number(input.after) || 0, LIMITS.broadcastBatch);
    let sent = 0;
    for (const u of batch) {
      if (await send(u.id, esc(text))) sent++;
    }
    // Мини-приложение вызывает это снова с after = next, пока next не станет null.
    return { sent, failed: batch.length - sent, next: batch.length === LIMITS.broadcastBatch ? batch.at(-1).id : null };
  }

  return { ...profile, ...(await adminOverview()) };
}
