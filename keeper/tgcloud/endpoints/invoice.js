// endpoints/invoice.js — ссылка на оплату Pro звёздами. Мини-приложение открывает её
// прямо у себя (Telegram.WebApp.openInvoice), без перехода в чат.

import { EndpointError } from 'sdk';
import { invoiceLink } from '../lib/ui.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx);
  if (user.vip) throw new EndpointError('VIP', { code: 'ALREADY_VIP' });
  return { url: await invoiceLink(user.lang), pro };
}
