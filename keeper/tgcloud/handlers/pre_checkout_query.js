// handlers/pre_checkout_query.js — Telegram спрашивает перед оплатой: «всё в порядке, берём звёзды?»
// Отвечать нужно в течение 10 секунд, иначе оплата отменится.

import { api } from 'sdk';

export default async function onPreCheckout(query) {
  const ok = query.invoice_payload === 'pro' && query.currency === 'XTR';
  await api.answerPreCheckoutQuery({
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: 'Unknown invoice' }),
  });
}
