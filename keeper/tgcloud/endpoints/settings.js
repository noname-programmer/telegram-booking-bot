// endpoints/settings.js — настройки из мини-приложения:
//   { notify: 0|1|2|3 }               — режим уведомлений (см. NOTIFY в lib/config.js)
//   { favOnly: true|false }           — уведомлять только об избранных собеседниках
//   { lang: 'ru'|'uz'|'en' }          — язык
//   { mute: { chatId, muted } }       — отключить уведомления по одному собеседнику
//   { fav: { chatId, fav } }          — добавить собеседника в избранные
//   { wipe: true }                    — удалить все сохранённые сообщения

import { NOTIFY } from '../lib/config.js';
import { LANGS } from '../lib/i18n.js';
import { setPrefs, setMuted, setFav, wipeUser } from '../lib/store.js';
import { whoami } from '../lib/app.js';

const chatOf = (value) => (value && Number.isFinite(Number(value.chatId)) ? Number(value.chatId) : null);

export default async function (input, ctx) {
  const { user } = await whoami(ctx);
  const patch = {};
  if (Object.values(NOTIFY).includes(input.notify)) patch.notify = input.notify;
  if (typeof input.favOnly === 'boolean') patch.favOnly = input.favOnly ? 1 : 0;
  if (typeof input.lang === 'string' && LANGS[input.lang]) patch.lang = input.lang;
  await setPrefs(user.id, patch);
  if (chatOf(input.mute) !== null) await setMuted(user.id, chatOf(input.mute), Boolean(input.mute.muted));
  if (chatOf(input.fav) !== null) await setFav(user.id, chatOf(input.fav), Boolean(input.fav.fav));
  if (input.wipe === true) await wipeUser(user.id);
  return (await whoami(ctx)).profile;
}
