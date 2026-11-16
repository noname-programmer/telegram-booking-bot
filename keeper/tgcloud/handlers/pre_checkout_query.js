// handlers/pre_checkout_query.js — Telegram спрашивает перед оплатой: «всё в порядке, берём звёзды?»
// Отвечать нужно в течение 10 секунд, иначе оплата отменится.
// Принимаем только свои счета: подписка ('pro'), год ('year') и подарок другу ('gift:<ID>') —
// и только по текущей цене: если владелец поменял цену, старые ссылки на оплату перестают работать.

import { api } from 'sdk';
import { PRO } from '../lib/config.js';
import { loadSettings } from '../lib/store.js';

export const knownPayload = (payload) => payload === 'pro' || payload === 'year' || /^gift:\d+$/.test(String(payload ?? ''));

export default async function onPreCheckout(query) {
  await loadSettings(); // цена могла поменяться в админ-панели
  const price = query.invoice_payload === 'year' ? PRO.yearStars : PRO.stars;
  const ok = knownPayload(query.invoice_payload) && query.currency === 'XTR' && query.total_amount === price;
  await api.answerPreCheckoutQuery({
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: 'This payment link is out of date. Please open /pro again.' }),
  });
}
