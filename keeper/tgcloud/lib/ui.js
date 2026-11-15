// lib/ui.js — тексты, кнопки и отправка уведомлений.
// Формат callback_data (данные кнопки, до 64 байт):
//   pro | lang | lang:<код> | notify | privacy | wipe:ask | wipe:yes | wipe:no
// Кнопка notify переключает режим уведомлений по кругу: тихо → коротко → сводка → полностью.

import { api, BotApiError, InputFile } from 'sdk';
import { BOT_NAME, MINIAPP_URL, PRO, LIMITS, NOTIFY, OWNER_ID } from './config.js';
import { t, LANGS } from './i18n.js';
import { isPro, hasActiveConnection, digestTick, weeklyTick, clearVault, proEndsSoon } from './store.js';

// Экранирует текст пользователя, чтобы он не сломал HTML-разметку.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Обрезает слишком длинный текст. Эмодзи занимает два «знака» подряд: если разрез попал
// между ними, убираем оставшуюся половинку, иначе Telegram не примет сообщение.
const cut = (s, max) => (s.length > max ? `${s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '')}…` : s);
const quote = (s, max) => `<blockquote>${esc(cut(s, max))}</blockquote>`;

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
    planLine(user),
    t(lang, `notify${user.notify}`),
  ];
  const rows = [];
  if (MINIAPP_URL) rows.push([{ text: t(lang, 'btnHistory'), web_app: { url: MINIAPP_URL } }]);
  rows.push([{ text: t(lang, 'btnPro'), callback_data: 'pro' }, { text: t(lang, 'btnLang'), callback_data: 'lang' }]);
  rows.push([{ text: t(lang, `btnNotify${user.notify}`), callback_data: 'notify' }]);
  rows.push([{ text: t(lang, 'btnPrivacy'), callback_data: 'privacy' }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: rows } };
}

// Строка о тарифе: владелец, VIP, Pro до даты или бесплатный.
export function planLine(user) {
  const lang = user.lang;
  if (user.id === OWNER_ID) return t(lang, 'planOwner');
  if (user.vip) return t(lang, 'planVip');
  return isPro(user) ? t(lang, 'planPro', { date: fmtDate(user.proUntil) }) : t(lang, 'planFree', { days: LIMITS.freeDays });
}

// Следующий режим уведомлений при нажатии кнопки в меню.
export const nextNotify = (mode) => ({ [NOTIFY.off]: NOTIFY.short, [NOTIFY.short]: NOTIFY.digest, [NOTIFY.digest]: NOTIFY.full })[mode] ?? NOTIFY.off;

// Кнопка «Открыть» под сообщением: запускает мини-приложение.
const openButton = (lang) => (MINIAPP_URL
  ? { reply_markup: { inline_keyboard: [[{ text: t(lang, 'btnOpen'), web_app: { url: MINIAPP_URL } }]] } }
  : {});

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

// Ссылка на оплату звёздами (её же открывает мини-приложение).
//   plan 'month' — подписка с автопродлением раз в 30 дней
//   plan 'year'  — разовая оплата на год со скидкой (payload 'year')
//   plan 'gift'  — месяц Pro в подарок пользователю giftTo (payload 'gift:<ID>')
export function invoiceLink(lang, plan = 'month', giftTo = null) {
  const vars = { stars: PRO.stars, freeDays: LIMITS.freeDays, proDays: LIMITS.proDays, days: plan === 'year' ? PRO.yearDays : PRO.giftDays };
  if (plan === 'year' || plan === 'gift') {
    const title = t(lang, plan === 'year' ? 'yearTitle' : 'giftTitle');
    return api.createInvoiceLink({
      title,
      description: t(lang, plan === 'year' ? 'yearDesc' : 'giftDesc', vars),
      payload: plan === 'year' ? 'year' : `gift:${giftTo}`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: title, amount: plan === 'year' ? PRO.yearStars : PRO.stars }],
    });
  }
  return api.createInvoiceLink({
    title: t(lang, 'proTitle'),
    description: t(lang, 'proDesc', vars),
    payload: 'pro',
    provider_token: '',
    currency: 'XTR', // XTR — звёзды Telegram
    prices: [{ label: t(lang, 'proTitle'), amount: PRO.stars }],
    subscription_period: PRO.periodSeconds,
  });
}

// Экран подписки: описание и кнопка оплаты звёздами.
export async function proScreen(user) {
  const lang = user.lang;
  const vars = { stars: PRO.stars, freeDays: LIMITS.freeDays, proDays: LIMITS.proDays };
  const about = t(lang, 'proAbout', vars);
  if (isPro(user)) return { text: `${about}\n\n${planLine(user)}` };
  const url = await invoiceLink(lang);
  const yearUrl = await invoiceLink(lang, 'year');
  return { text: about, reply_markup: { inline_keyboard: [
    [{ text: t(lang, 'btnPay', vars), url }],
    [{ text: t(lang, 'btnPayYear', { stars: PRO.yearStars }), url: yearUrl }],
  ] } };
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

// Копирует файл удалённого сообщения в канал-«сейф» пользователя (если он его подключил и у него Pro или VIP).
// Файл не скачивается: бот отправляет в канал ту же ссылку Telegram, поэтому это быстро при любом размере.
const NO_CAPTION = ['sticker', 'video_note'];
export async function vaultCopy(user, row, fileId = row.fileId, kind = row.kind) {
  const method = SEND[kind];
  if (!user.vaultId || !fileId || !method || !isPro(user)) return false;
  const when = new Date((row.date + user.tz * 60) * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const caption = `🗑 ${row.fromName} · ${when}${row.text ? `\n${row.text}` : ''}`.slice(0, 1000);
  try {
    await api[method]({ chat_id: user.vaultId, [kind]: fileId, ...(NO_CAPTION.includes(kind) ? {} : { caption }) });
    return true;
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    // Бота убрали из канала или канал удалён — отвязываем «сейф», чтобы не стучаться туда каждый раз.
    if (e.code === 403 || /chat not found/i.test(e.description ?? '')) {
      await clearVault(user.vaultId);
      user.vaultId = null;
    }
    return false;
  }
}

// Тревога «чат очищен»: собеседник (или вы сами) разом удалил много сообщений. Приходит и в тихом режиме,
// если пользователь не выключил её в профиле и не отключил звук у этого собеседника.
export async function clearAlert(user, chatId, peer, name, count) {
  if (!user.alertClear || peer?.muted || count < LIMITS.clearAlert) return false;
  await send(chatId, t(user.lang, 'clearAlert', { name: esc(name), n: count }), openButton(user.lang));
  return true;
}

// Напоминание за сутки до окончания Pro (пробного, по промокоду, подарочного или годового).
export async function proReminder(user, chatId) {
  if (!(await proEndsSoon(user))) return;
  const lang = user.lang;
  const url = await invoiceLink(lang);
  await send(chatId, t(lang, 'proEnds', { date: fmtDate(user.proUntil) }), {
    reply_markup: { inline_keyboard: [[{ text: t(lang, 'btnPay', { stars: PRO.stars }), url }]] },
  });
}

// Раз в неделю (при первом сообщении новой недели) присылает короткий отчёт за прошлую. Только Pro и VIP.
export async function weeklyReport(user, chatId) {
  if (!user.weekly || !isPro(user)) return;
  const data = await weeklyTick(user);
  if (!data) return;
  const lang = user.lang;
  const lines = [t(lang, 'weekTitle'), '', t(lang, 'weekTotals', data)];
  if (data.top.length) lines.push('', t(lang, 'weekTop'), ...data.top.map(([name, n], i) => `${['🥇', '🥈', '🥉'][i]} ${esc(name)} — ${n}`));
  if (data.hour !== null) lines.push('', t(lang, 'weekHour', { from: String(data.hour).padStart(2, '0'), to: String((data.hour + 1) % 24).padStart(2, '0') }));
  await send(chatId, lines.join('\n'), openButton(lang));
}

// Фото и видео, которые по ссылке Telegram отправляются «как фото/видео». Чтобы получить именно файл
// (его можно сохранить в исходном виде, Telegram его не пережимает), бот скачивает его и отправляет документом.
const AS_FILE = { photo: ['jpg', 'image/jpeg'], video: ['mp4', 'video/mp4'], video_note: ['mp4', 'video/mp4'], animation: ['mp4', 'video/mp4'] };
export const canSendAsFile = (kind) => Boolean(AS_FILE[kind]);

export function fileName(kind, date, meta = {}) {
  if (meta.fileName) return meta.fileName;
  const [ext] = AS_FILE[kind] ?? ['bin'];
  const stamp = new Date((date ?? 0) * 1000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
  const fromMime = { 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/png': 'png', 'image/webp': 'webp' }[meta.mime];
  return `${kind}_${stamp}.${fromMime ?? ext}`;
}

// Отправляет фото или видео файлом без сжатия. Возвращает false, если не получилось
// (тогда вызывающий код отправит обычным способом — качество то же, но это будет «фото», а не «файл»).
export async function sendAsFile(chatId, file, date) {
  const meta = file.meta ?? {};
  if (!canSendAsFile(file.kind) || (meta.size ?? 0) > LIMITS.asFileMax) return false;
  try {
    const bytes = await api.getFileContent(file.fileId);
    if (bytes.length > LIMITS.asFileMax) return false;
    await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(bytes, fileName(file.kind, date, meta), { type: meta.mime ?? AS_FILE[file.kind][1] }),
      disable_content_type_detection: true, // иначе Telegram сам превратит файл обратно в «видео» или GIF
    });
    return true;
  } catch (e) {
    if (e instanceof BotApiError) return false;
    throw e;
  }
}

// Текст о сообщении: вид (если это не просто текст) и содержимое.
function body(lang, row, max = LIMITS.textMax) {
  const parts = [];
  if (row.kind !== 'text') parts.push(t(lang, `kind_${row.kind}`));
  if (row.text) parts.push(quote(row.text, max));
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
  // В одном сообщении два текста («было» и «стало»), а лимит Telegram — 4096 знаков на всё сообщение.
  const half = Math.floor(LIMITS.textMax / 2);
  await send(chatId, [
    t(lang, 'edited', { name: esc(before.fromName) }),
    `<b>${t(lang, 'was')}</b>`, body(lang, before, half) || '—',
    `<b>${t(lang, 'now')}</b>`, body(lang, { ...before, ...after }, half) || '—',
  ].join('\n'));
}

// Решает, писать ли владельцу аккаунта в чат с ботом, и в каком виде. Запись в мини-приложении появляется всегда.
//   peer  — строка собеседника из таблицы chats (в ней «без звука» и «избранный»)
//   event — { type: 'deleted', rows } или { type: 'edited', before, after }
export async function announce(user, chatId, peer, event) {
  const lang = user.lang;
  const mode = user.notify;
  if (!mode || peer?.muted || (user.favOnly && !peer?.fav)) return;
  const deleted = event.type === 'deleted';
  const n = deleted ? event.rows.length : 1;
  const name = esc(deleted ? event.rows[0].fromName : event.before.fromName);

  if (mode === NOTIFY.digest) {
    // Одно сообщение в день: при первом событии дня. Остальное молча копится.
    const prev = await digestTick(user, event.type, n);
    if (!prev) return;
    const lines = [t(lang, deleted ? 'digestDeleted' : 'digestEdited', { name }), t(lang, 'digestRest')];
    if (prev.deleted + prev.edited > 0) lines.push('', t(lang, 'digestPrev', prev));
    await send(chatId, lines.join('\n'), openButton(lang));
    return;
  }
  if (mode === NOTIFY.short) {
    const key = deleted ? (n > 1 ? 'shortDeletedMany' : 'shortDeleted') : 'shortEdited';
    await send(chatId, t(lang, key, { name, n }), openButton(lang));
    return;
  }
  if (!deleted) return notifyEdited(user, chatId, event.before, event.after);
  // Удалили весь чат или много сообщений сразу — не засыпаем пользователя уведомлениями.
  const shown = event.rows.slice(0, LIMITS.notifyPerDelete);
  if (n > shown.length) await send(chatId, t(lang, 'deletedMany', { name, n, shown: shown.length }));
  for (const row of shown) await notifyDeleted(user, chatId, row);
}
