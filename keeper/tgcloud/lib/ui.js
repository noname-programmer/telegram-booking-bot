// lib/ui.js — тексты, кнопки и отправка уведомлений.
// Формат callback_data (данные кнопки, до 64 байт):
//   menu | pro | lang | lang:<код> | privacy | wipe:ask | wipe:yes | wipe:no

import { api, BotApiError } from 'sdk';
import { BOT_NAME, MINIAPP_URL, PRO, LIMITS } from './config.js';
import { t, LANGS } from './i18n.js';
import { isPro, hasActiveConnection } from './store.js';

// Экранирует текст пользователя, чтобы он не сломал HTML-разметку.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cut = (s) => (s.length > LIMITS.textMax ? `${s.slice(0, LIMITS.textMax)}…` : s);
const quote = (s) => `<blockquote>${esc(cut(s))}</blockquote>`;

export const fmtDate = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

// Отправляет сообщение и не падает, если пользователь заблокировал бота.
export async function send(chatId, text, extra = {}) {
  try {
    return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  } catch (e) {
    if (e instanceof BotApiError && (e.code === 403 || e.code === 400)) return null;
    throw e;
  }
}

// ---------- меню ----------

export async function menu(user, username) {
  const lang = user.lang;
  const lines = [
    t(lang, 'start', { bot: BOT_NAME, username }),
    '',
    t(lang, (await hasActiveConnection(user.id)) ? 'statusOn' : 'statusOff'),
    isPro(user) ? t(lang, 'planPro', { date: fmtDate(user.proUntil) }) : t(lang, 'planFree', { days: LIMITS.freeDays }),
  ];
  const rows = [];
  if (MINIAPP_URL) rows.push([{ text: t(lang, 'btnHistory'), web_app: { url: MINIAPP_URL } }]);
  rows.push([{ text: t(lang, 'btnPro'), callback_data: 'pro' }, { text: t(lang, 'btnLang'), callback_data: 'lang' }]);
  rows.push([{ text: t(lang, 'btnPrivacy'), callback_data: 'privacy' }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: rows } };
}

export function langKeyboard() {
  return { inline_keyboard: [Object.entries(LANGS).map(([code, name]) => ({ text: name, callback_data: `lang:${code}` }))] };
}

export function privacyScreen(lang) {
  return {
    text: t(lang, 'privacy', { freeDays: LIMITS.freeDays, proDays: LIMITS.proDays }),
    reply_markup: { inline_keyboard: [[{ text: t(lang, 'btnWipe'), callback_data: 'wipe:ask' }]] },
  };
}

export function wipeConfirm(lang) {
  return {
    text: t(lang, 'wipeAsk'),
    reply_markup: { inline_keyboard: [[
      { text: t(lang, 'btnYes'), callback_data: 'wipe:yes' },
      { text: t(lang, 'btnNo'), callback_data: 'wipe:no' },
    ]] },
  };
}

// Экран подписки: описание и кнопка оплаты звёздами.
export async function proScreen(user) {
  const lang = user.lang;
  const vars = { stars: PRO.stars, freeDays: LIMITS.freeDays, proDays: LIMITS.proDays };
  const about = t(lang, 'proAbout', vars);
  if (isPro(user)) return { text: `${about}\n\n${t(lang, 'planPro', { date: fmtDate(user.proUntil) })}` };
  const url = await api.createInvoiceLink({
    title: t(lang, 'proTitle'),
    description: t(lang, 'proDesc', vars),
    payload: 'pro',
    provider_token: '',
    currency: 'XTR', // XTR — звёзды Telegram
    prices: [{ label: t(lang, 'proTitle'), amount: PRO.stars }],
    subscription_period: PRO.periodSeconds,
  });
  return { text: about, reply_markup: { inline_keyboard: [[{ text: t(lang, 'btnPay', vars), url }]] } };
}

// ---------- уведомления об удалённых и изменённых сообщениях ----------

const SEND = {
  photo: 'sendPhoto', video: 'sendVideo', video_note: 'sendVideoNote', voice: 'sendVoice',
  audio: 'sendAudio', document: 'sendDocument', animation: 'sendAnimation', sticker: 'sendSticker',
};

// Отправляет сохранённый файл в чат с ботом. Возвращает false, если Telegram файл уже не отдаёт.
export async function sendMedia(chatId, row) {
  const method = SEND[row.kind];
  if (!method || !row.fileId) return false;
  try {
    await api[method]({ chat_id: chatId, [row.kind]: row.fileId });
    return true;
  } catch (e) {
    if (e instanceof BotApiError) return false;
    throw e;
  }
}

// Текст о сообщении: вид (если это не просто текст) и содержимое.
function body(lang, row) {
  const parts = [];
  if (row.kind !== 'text') parts.push(t(lang, `kind_${row.kind}`));
  if (row.text) parts.push(quote(row.text));
  return parts.join('\n');
}

export async function notifyDeleted(user, chatId, row) {
  const lang = user.lang;
  const lines = [t(lang, 'deleted', { name: esc(row.fromName) }), body(lang, row)];
  const pro = isPro(user);
  if (row.fileId && !pro) lines.push(t(lang, 'mediaLocked'));
  await send(chatId, lines.join('\n'));
  if (row.fileId && pro) await sendMedia(chatId, row);
}

export async function notifyEdited(user, chatId, before, after) {
  const lang = user.lang;
  await send(chatId, [
    t(lang, 'edited', { name: esc(before.fromName) }),
    `<b>${t(lang, 'was')}</b>`, body(lang, before) || '—',
    `<b>${t(lang, 'now')}</b>`, body(lang, { ...before, ...after }) || '—',
  ].join('\n'));
}
