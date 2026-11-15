// endpoints/promo.js — ввод промокода в мини-приложении: { code } → дни Pro.

import { EndpointError } from 'sdk';
import { t } from '../lib/i18n.js';
import { redeemPromo } from '../lib/store.js';
import { fmtDate } from '../lib/ui.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user } = await whoami(ctx, input);
  const res = await redeemPromo(user, input.code);
  if (!res.ok) throw new EndpointError(t(user.lang, `promo_${res.reason}`), { code: 'PROMO' });
  return { message: t(user.lang, 'promoOk', { days: res.days, date: fmtDate(res.until) }), profile: (await whoami(ctx, input)).profile };
}
