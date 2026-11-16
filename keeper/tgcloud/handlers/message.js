// handlers/message.js — сообщения, которые пользователь пишет самому боту.
// (Сообщения из чатов пользователя с другими людьми приходят в handlers/business_message.js.)

import { api } from 'sdk';
import { ADMIN_IDS, OWNER_ID, PRO } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import {
  getUser, grantPro, now, stats, setReferrer, adminSetVip, isAdmin, redeemPromo, recordPayment, addProDays, paymentsOf,
  getPayment, markRefunded,
} from '../lib/store.js';
import { send, menu, proScreen, langKeyboard, privacyScreen, fmtDate, esc, proReminder } from '../lib/ui.js';

export default async function onMessage(message) {
  if (message.chat?.type !== 'private' || !message.from) return;
  const chatId = message.chat.id;
  const user = await getUser(message.from);
  const lang = user.lang;

  // Звёзды вернули (из админ-панели или через поддержку Telegram) — снимаем Pro за этот платёж.
  if (message.refunded_payment) {
    const pay = await getPayment(message.refunded_payment.telegram_payment_charge_id);
    if (pay && !pay.refunded) await markRefunded(pay);
    return;
  }

  // Оплата прошла (первая или автоматическое продление): включаем Pro.
  const pay = message.successful_payment;
  if (pay) {
    const charge = pay.telegram_payment_charge_id;
    // Год со скидкой: разовая оплата, дни прибавляются к уже оплаченному сроку.
    if (pay.invoice_payload === 'year') {
      if (!(await recordPayment(charge, user.id, pay.total_amount, 'year'))) return;
      const date = await addProDays(user.id, PRO.yearDays);
      return send(chatId, t(lang, 'proThanks', { date: fmtDate(date) }));
    }
    // Подарок другу: Pro получает не тот, кто платил.
    const gift = /^gift:(\d+)$/.exec(pay.invoice_payload ?? '');
    if (gift) {
      if (!(await recordPayment(charge, user.id, pay.total_amount, 'gift', Number(gift[1])))) return;
      const friend = await getUser({ id: Number(gift[1]) });
      const date = await addProDays(friend.id, PRO.giftDays);
      await send(friend.id, t(friend.lang, 'giftGot', { name: esc(user.name || '?'), days: PRO.giftDays, date: fmtDate(date) }));
      return send(chatId, t(lang, 'giftSent', { name: esc(friend.name || String(friend.id)), days: PRO.giftDays }));
    }
    if (pay.invoice_payload !== 'pro') return;
    const until = pay.subscription_expiration_date ?? now() + PRO.periodSeconds;
    const fresh = await grantPro(user.id, until, pay.telegram_payment_charge_id, pay.total_amount);
    if (fresh) await send(chatId, t(lang, 'proThanks', { date: fmtDate(until) }));
    return;
  }

  if (user.banned) return send(chatId, t(lang, 'banned'));

  const command = (message.text ?? '').split(/[\s@]/)[0];
  if (command === '/pro') return send(chatId, ...split(await proScreen(user)));
  if (command === '/lang') return send(chatId, t(lang, 'chooseLang'), { reply_markup: langKeyboard() });
  if (command === '/privacy') return send(chatId, ...split(privacyScreen(lang)));
  if (command === '/stats' && isAdmin(user)) return send(chatId, t(lang, 'stats', await stats()));

  // /promo КОД — получить дни Pro по промокоду.
  if (command === '/promo') {
    const res = await redeemPromo(user, (message.text ?? '').split(/\s+/)[1]);
    return send(chatId, res.ok ? t(lang, 'promoOk', { days: res.days, date: fmtDate(res.until) }) : t(lang, `promo_${res.reason}`));
  }

  // /terms — условия использования (Telegram требует их у ботов, которые принимают оплату).
  if (command === '/terms') return send(chatId, t(lang, 'terms'));

  // /paysupport — вопрос по оплате. Текст после команды пересылаем владельцу вместе с последними оплатами.
  if (command === '/paysupport') {
    const question = (message.text ?? '').replace(/^\/paysupport(@\w+)?\s*/, '').trim().slice(0, 1500);
    if (!question) return send(chatId, t(lang, 'paySupportHow'));
    const pays = (await paymentsOf(user.id)).map((p) => `${fmtDate(p.at)} · ${p.kind} · ⭐️${p.stars}${p.refunded ? ' · refunded' : ''}\n<code>${esc(p.chargeId)}</code>`);
    await send(OWNER_ID, [
      `🧾 <b>/paysupport</b> — ${esc(user.name || '?')}${user.username ? ` @${esc(user.username)}` : ''} · ID <code>${user.id}</code>`,
      '', esc(question), '', pays.length ? pays.join('\n') : '—',
    ].join('\n'));
    return send(chatId, t(lang, 'paySupportSent'));
  }

  // /resetpin — забыли PIN-код от приложения. Сбросить можно только вместе со всеми сохранёнными данными,
  // иначе PIN ничего бы не защищал.
  if (command === '/resetpin') {
    if (!user.pin) return send(chatId, t(lang, 'pinNone'));
    return send(chatId, t(lang, 'pinResetAsk'), { reply_markup: { inline_keyboard: [[
      { text: t(lang, 'btnPinReset'), callback_data: 'pin:reset' }, { text: t(lang, 'btnNo'), callback_data: 'wipe:no' },
    ]] } });
  }

  // /vip 123456 и /unvip 123456 — выдать или снять бессрочный VIP (только для владельца).
  if ((command === '/vip' || command === '/unvip') && ADMIN_IDS.includes(user.id)) {
    const id = Number((message.text ?? '').split(/\s+/)[1]);
    if (!Number.isSafeInteger(id) || id <= 0) return send(chatId, t(lang, 'vipUsage'));
    const on = command === '/vip';
    const target = await adminSetVip(id, on);
    if (on) await send(id, t(target.lang, 'vipGiven'));
    return send(chatId, t(lang, on ? 'vipOn' : 'vipOff', { id }));
  }

  // Пришёл по приглашению: /start ref_<ID друга>.
  const ref = /^\/start(?:@\w+)?\s+ref_(\d+)$/.exec(message.text ?? '');
  if (ref) await setReferrer(user, Number(ref[1]));

  // /start, /help и любой другой текст — главное меню.
  const me = await api.getMe();
  await send(chatId, ...split(await menu(user, me.username)));
  // Если Pro заканчивается завтра — напоминаем (один раз на каждый срок). Best-effort: не роняем ответ на /start.
  try { await proReminder(user, chatId); } catch { /* напомним в следующий раз */ }
}

// { text, reply_markup } → аргументы для send(chatId, text, extra)
const split = ({ text, ...extra }) => [text, extra];
