// endpoints/invoice.js — ссылка на оплату звёздами. Мини-приложение открывает её прямо у себя
// (Telegram.WebApp.openInvoice), без перехода в чат.
//   {}                       — подписка Pro на месяц с автопродлением
//   { plan: 'year' }         — год со скидкой, разовая оплата
//   { plan: 'gift', to }     — месяц Pro в подарок; to — ID или @username друга (он должен был запустить бота)

import { EndpointError } from 'sdk';
import { t } from '../lib/i18n.js';
import { findUser } from '../lib/store.js';
import { invoiceLink } from '../lib/ui.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx, input);
  if (input.plan === 'gift') {
    const friend = await findUser(input.to);
    if (!friend || !friend.name) throw new EndpointError(t(user.lang, 'giftNoUser'), { code: 'NO_USER' });
    if (friend.id === user.id) throw new EndpointError(t(user.lang, 'giftSelf'), { code: 'SELF' });
    return { url: await invoiceLink(user.lang, 'gift', friend.id), pro, to: { id: friend.id, name: friend.name } };
  }
  if (user.vip) throw new EndpointError('VIP', { code: 'ALREADY_VIP' });
  return { url: await invoiceLink(user.lang, input.plan === 'year' ? 'year' : 'month'), pro };
}
