// bot.js — запуск бота на обычном Node.js (компьютер, VPS, Docker).
//
// На Telegram Serverless обновления приходят через webhook, и платформа сама вызывает
// handlers/*.js. Здесь мы делаем то же самое вручную: забираем обновления через
// long polling (getUpdates) и передаём их тем же самым обработчикам — код бота общий.
//
// Запуск: cd standalone && npm install && npm start

import { api, BotApiError } from 'sdk';
import onMessage from '../tgcloud/handlers/message.js';
import onCallbackQuery from '../tgcloud/handlers/callback_query.js';

const HANDLERS = {
  message: onMessage,
  callback_query: onCallbackQuery,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!process.env.BOT_TOKEN) {
  console.error('❌ Не задан BOT_TOKEN.\n   Скопируйте standalone/.env.example в standalone/.env и вставьте токен от @BotFather.');
  process.exit(1);
}

// Проверяем токен и связь с Telegram. Нет сети — ждём (например, сервер ещё загружается).
let me;
for (;;) {
  try {
    me = await api.getMe();
    break;
  } catch (e) {
    if (e instanceof BotApiError && (e.code === 401 || e.code === 404)) {
      console.error('❌ Telegram не принял BOT_TOKEN. Проверьте токен в standalone/.env (@BotFather → API Token).');
      process.exit(1);
    }
    console.error('⚠️  Нет связи с Telegram:', e.cause?.code ?? e.message, '— повтор через 5 секунд…');
    await sleep(5_000);
  }
}

// Если у бота включён webhook (например, он работает на Telegram Serverless),
// getUpdates не сработает. Удаляем webhook только по явному согласию.
const webhook = await api.getWebhookInfo();
if (webhook.url) {
  if (process.env.DELETE_WEBHOOK === '1') {
    await api.deleteWebhook({});
    console.log('ℹ️  Webhook удалён — бот переключён на этот сервер.');
  } else {
    console.error(
      `❌ У бота @${me.username} настроен webhook (${webhook.url}).\n` +
      '   Похоже, бот уже работает в другом месте (например, на Telegram Serverless).\n' +
      '   Чтобы запустить его здесь, выключите Serverless в @BotFather или запустите с DELETE_WEBHOOK=1.',
    );
    process.exit(1);
  }
}

console.log(`✅ Бот @${me.username} запущен. Остановить: Ctrl+C`);

// Аккуратная остановка: если бот как раз обрабатывает сообщение — даём закончить.
let busy = false;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (!busy) process.exit(0);
  });
}

let offset = 0;
while (!stopping) {
  let updates;
  try {
    updates = await api.getUpdates({ offset, timeout: 30, allowed_updates: Object.keys(HANDLERS) });
  } catch (e) {
    if (e instanceof BotApiError && e.code === 409) {
      console.error('⚠️  Этот бот уже запущен в другом месте (409 Conflict). Повтор через 10 секунд…');
      await sleep(10_000);
    } else {
      console.error('⚠️  Нет связи с Telegram:', e.message, '— повтор через 3 секунды…');
      await sleep(3_000);
    }
    continue;
  }

  busy = true;
  for (const update of updates) {
    offset = update.update_id + 1;
    const type = Object.keys(HANDLERS).find((t) => update[t]);
    if (!type) continue;
    try {
      await HANDLERS[type](update[type], { update });
    } catch (e) {
      // Ошибка в одном сообщении не должна останавливать бота.
      console.error(`❌ Ошибка при обработке ${type} (update ${update.update_id}):`, e);
    }
  }
  busy = false;
}
process.exit(0);
