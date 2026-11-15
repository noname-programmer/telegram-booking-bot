// handlers/pre_checkout_query.js — Telegram спрашивает перед оплатой: «всё в порядке, берём звёзды?»
// Отвечать нужно в течение 10 секунд, иначе оплата отменится.
// Принимаем только свои счета: подписка ('pro'), год ('year') и подарок другу ('gift:<ID>').

import { api } from 'sdk';

export const knownPayload = (payload) => payload === 'pro' || payload === 'year' || /^gift:\d+$/.test(String(payload ?? ''));

export default async function onPreCheckout(query) {
  const ok = knownPayload(query.invoice_payload) && query.currency === 'XTR';
  await api.answerPreCheckoutQuery({
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: 'Unknown invoice' }),
  });
}
