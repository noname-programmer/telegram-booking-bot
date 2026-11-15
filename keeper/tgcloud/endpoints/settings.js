// endpoints/settings.js — настройки из мини-приложения:
//   { notify: true|false }            — присылать ли уведомления в чат с ботом
//   { lang: 'ru'|'uz'|'en' }          — язык
//   { mute: { chatId, muted } }       — отключить уведомления по одному собеседнику
//   { wipe: true }                    — удалить все сохранённые сообщения

import { LANGS } from '../lib/i18n.js';
import { setNotify, setLang, setMuted, wipeUser } from '../lib/store.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user } = await whoami(ctx);
  if (typeof input.notify === 'boolean') await setNotify(user.id, input.notify);
  if (typeof input.lang === 'string' && LANGS[input.lang]) await setLang(user.id, input.lang);
  if (input.mute && Number.isFinite(Number(input.mute.chatId))) {
    await setMuted(user.id, Number(input.mute.chatId), Boolean(input.mute.muted));
  }
  if (input.wipe === true) await wipeUser(user.id);
  return (await whoami(ctx)).profile;
}
