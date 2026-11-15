// handlers/callback_query.js — нажатия на кнопки под сообщениями бота.

import { api, BotApiError } from 'sdk';
import { t, LANGS } from '../lib/i18n.js';
import { getUser, setLang, setNotify, wipeUser, setPin } from '../lib/store.js';
import { send, menu, proScreen, langKeyboard, privacyScreen, wipeConfirm, nextNotify } from '../lib/ui.js';

export default async function onCallback(query) {
  const chatId = query.message?.chat?.id ?? query.from.id;
  const user = await getUser(query.from);
  const lang = user.lang;
  const data = String(query.data ?? '');
  let toast;
  if (user.banned) {
    try { await api.answerCallbackQuery({ callback_query_id: query.id, text: t(lang, 'banned') }); } catch (e) { if (!(e instanceof BotApiError)) throw e; }
    return;
  }

  if (data === 'pro') {
    const { text, ...extra } = await proScreen(user);
    await send(chatId, text, extra);
  } else if (data === 'lang') {
    await send(chatId, t(lang, 'chooseLang'), { reply_markup: langKeyboard() });
  } else if (data.startsWith('lang:') && LANGS[data.slice(5)]) {
    user.lang = data.slice(5);
    await setLang(user.id, user.lang);
    toast = t(user.lang, 'langSet');
    const me = await api.getMe();
    const { text, ...extra } = await menu(user, me.username);
    await send(chatId, text, extra);
  } else if (data === 'notify') {
    // Режимы по кругу: тихо → коротко → сводка раз в день → полностью.
    user.notify = nextNotify(user.notify);
    await setNotify(user.id, user.notify);
    const me = await api.getMe();
    const { text, ...extra } = await menu(user, me.username);
    await send(chatId, text, extra);
  } else if (data === 'privacy') {
    const { text, ...extra } = privacyScreen(lang);
    await send(chatId, text, extra);
  } else if (data === 'wipe:ask') {
    const { text, ...extra } = wipeConfirm(lang);
    await send(chatId, text, extra);
  } else if (data === 'wipe:yes') {
    await wipeUser(user.id);
    await send(chatId, t(lang, 'wiped'));
  } else if (data === 'pin:reset') {
    // Сброс PIN-кода: вместе с ним стираются все сохранённые сообщения.
    await wipeUser(user.id);
    await setPin(user, null);
    await send(chatId, t(lang, 'pinResetDone'));
  } else if (data === 'wipe:no') {
    toast = t(lang, 'cancelled');
  }

  // Убираем «часики» на кнопке. Если нажатие устарело, Telegram ответит ошибкой 400 — это не страшно.
  try {
    await api.answerCallbackQuery({ callback_query_id: query.id, ...(toast ? { text: toast } : {}) });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
  }
}
