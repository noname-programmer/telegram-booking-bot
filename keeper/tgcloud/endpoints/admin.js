// endpoints/admin.js — админ-панель в мини-приложении. Доступна только тем, кто записан в ADMIN_IDS (lib/config.js).
// Показывает цифры и список пользователей; тексты чужих сообщений сюда не попадают.
//   {}                                         — общая сводка
//   { action: 'pro', userId, days }            — подарить Pro на days дней (0 — снять)
//   { action: 'vip', userId, on }              — выдать или снять бессрочный VIP
//   { action: 'broadcast', text, after }       — разослать сообщение порцией пользователей (after — ID, после которого продолжать)
//   { action: 'ban', userId, on }              — заблокировать или разблокировать
//   { action: 'role', userId, on }             — назначить или снять помощника (второго админа)
//   { action: 'promoAdd', code, days, uses }   — создать промокод;  { action: 'promoDel', code } — удалить
//   { action: 'settings', values: {…} }        — цена и лимиты (см. TUNABLE в lib/store.js)
//   { action: 'refund', chargeId }             — вернуть звёзды за платёж (только владелец); Pro за него снимается
//   { action: 'refPrize' }                     — наградить три первых места рейтинга приглашений (REF.prizes)
// Помощнику доступно всё, кроме VIP, рассылки, настроек и назначения помощников — это только владельцу.

import { api, BotApiError, EndpointError } from 'sdk';
import { LIMITS, REF } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import {
  adminOverview, adminSetPro, adminSetVip, adminSetBanned, adminSetRole, broadcastBatch,
  createPromo, deletePromo, saveSettings, refTop, addProDays, getUser, getPayment, markRefunded,
} from '../lib/store.js';
import { send, esc } from '../lib/ui.js';
import { whoami, requireAdmin, requireOwner } from '../lib/app.js';

const bad = (code) => new EndpointError(code, { code });

export default async function (input, ctx) {
  const { user } = await whoami(ctx, input);
  requireAdmin(user);
  const userId = Number(input.userId);

  if (input.action === 'pro') {
    const days = Number(input.days);
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw bad('BAD_INPUT');
    if (!(await adminSetPro(userId, days))) throw bad('NOT_FOUND');
  }

  if (input.action === 'ban' && !(await adminSetBanned(userId, Boolean(input.on)))) throw bad('NOT_FOUND');

  if (input.action === 'promoAdd' && !(await createPromo(input.code, Number(input.days), Number(input.uses)))) throw bad('BAD_INPUT');
  if (input.action === 'promoDel') await deletePromo(input.code);

  if (input.action === 'role') {
    requireOwner(user);
    if (!(await adminSetRole(userId, Boolean(input.on)))) throw bad('NOT_FOUND');
  }

  if (input.action === 'settings') {
    requireOwner(user);
    if (!(await saveSettings(input.values ?? {}))) throw bad('BAD_INPUT');
  }

  if (input.action === 'refund') {
    requireOwner(user);
    const pay = await getPayment(input.chargeId);
    if (!pay) throw bad('NOT_FOUND');
    if (pay.refunded) throw bad('ALREADY');
    try {
      await api.refundStarPayment({ user_id: pay.userId, telegram_payment_charge_id: pay.chargeId });
    } catch (e) {
      if (e instanceof BotApiError) throw new EndpointError(e.description ?? 'Refund failed', { code: 'REFUND_FAILED' });
      throw e;
    }
    // Возврат за подписку — ещё и отменяем её, иначе через месяц Telegram спишет звёзды снова.
    if (pay.kind === 'pro') {
      try {
        await api.editUserStarSubscription({ user_id: pay.userId, telegram_payment_charge_id: pay.chargeId, is_canceled: true });
      } catch (e) { if (!(e instanceof BotApiError)) throw e; } // подписка уже отменена или истекла — не страшно
    }
    await markRefunded(pay);
    const payer = await getUser({ id: pay.userId });
    await send(pay.userId, t(payer.lang, 'refunded', { stars: pay.stars }));
  }

  if (input.action === 'refPrize') {
    requireOwner(user);
    const winners = await refTop(REF.prizes.length);
    for (const [i, w] of winners.entries()) {
      await addProDays(w.id, REF.prizes[i]);
      const lang = (await getUser({ id: w.id })).lang;
      await send(w.id, t(lang, 'prizeGot', { place: i + 1, days: REF.prizes[i] }));
    }
  }

  if (input.action === 'vip') {
    requireOwner(user);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw bad('BAD_INPUT');
    const target = await adminSetVip(userId, Boolean(input.on));
    if (input.on) await send(userId, t(target.lang, 'vipGiven')); // не дойдёт, если человек ещё не запускал бота — это не ошибка
  }

  if (input.action === 'broadcast') {
    requireOwner(user);
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

  // Профиль берём заново: настройки могли только что измениться.
  return { ...(await whoami(ctx, input)).profile, ...(await adminOverview()) };
}
