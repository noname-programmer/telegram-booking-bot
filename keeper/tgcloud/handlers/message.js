// handlers/message.js — сообщения, которые пользователь пишет самому боту.
// (Сообщения из чатов пользователя с другими людьми приходят в handlers/business_message.js.)

import { api } from 'sdk';
import { ADMIN_IDS, PRO } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { getUser, grantPro, now, stats, setReferrer, adminSetVip } from '../lib/store.js';
import { send, menu, proScreen, langKeyboard, privacyScreen, fmtDate } from '../lib/ui.js';

export default async function onMessage(message) {
  if (message.chat?.type !== 'private' || !message.from) return;
  const chatId = message.chat.id;
  const user = await getUser(message.from);
  const lang = user.lang;

  // Оплата прошла (первая или автоматическое продление): включаем Pro.
  const pay = message.successful_payment;
  if (pay) {
    if (pay.invoice_payload !== 'pro') return;
    const until = pay.subscription_expiration_date ?? now() + PRO.periodSeconds;
    const fresh = await grantPro(user.id, until, pay.telegram_payment_charge_id, pay.total_amount);
    if (fresh) await send(chatId, t(lang, 'proThanks', { date: fmtDate(until) }));
    return;
  }

  const command = (message.text ?? '').split(/[\s@]/)[0];
  if (command === '/pro') return send(chatId, ...split(await proScreen(user)));
  if (command === '/lang') return send(chatId, t(lang, 'chooseLang'), { reply_markup: langKeyboard() });
  if (command === '/privacy') return send(chatId, ...split(privacyScreen(lang)));
  if (command === '/stats' && ADMIN_IDS.includes(user.id)) return send(chatId, t(lang, 'stats', await stats()));

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
  return send(chatId, ...split(await menu(user, me.username)));
}

// { text, reply_markup } → аргументы для send(chatId, text, extra)
const split = ({ text, ...extra }) => [text, extra];
