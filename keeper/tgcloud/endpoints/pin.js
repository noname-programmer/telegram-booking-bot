// endpoints/pin.js — PIN-код на вход в мини-приложение.
//   { pin }                 — просто проверить (экран блокировки)
//   { pin, set: '1234' }    — поставить или сменить (pin — текущий, если он уже есть)
//   { pin, remove: true }   — убрать
// Сама проверка текущего PIN происходит в whoami: без верного PIN сюда не попасть.

import { EndpointError } from 'sdk';
import { t } from '../lib/i18n.js';
import { setPin, validPin } from '../lib/store.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user } = await whoami(ctx, input);
  if (input.set !== undefined) {
    if (!validPin(input.set)) throw new EndpointError(t(user.lang, 'pinBad'), { code: 'BAD_INPUT' });
    await setPin(user, input.set);
  } else if (input.remove === true) {
    await setPin(user, null);
  }
  return { hasPin: Boolean(user.pin) };
}
