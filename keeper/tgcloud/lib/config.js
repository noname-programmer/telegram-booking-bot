// lib/config.js — все настройки бота в одном месте.

// Название бота в сообщениях.
export const BOT_NAME = 'Keeper';

// Telegram ID владельца: ему доступна команда /stats.
export const ADMIN_IDS = [
  498648129, // Низомиддин (владелец)
];

// Адрес мини-приложения. Его печатает `npx tgcloud push` после первого деплоя
// (вида https://app123456.tgcloud.ai/). Пока пусто — кнопка «История» не показывается.
export const MINIAPP_URL = 'https://app9031922868.tgcloud.ai/';

// Подписка Pro: цена в звёздах Telegram и срок (Telegram разрешает только 30 дней).
export const PRO = {
  stars: 150,
  periodSeconds: 30 * 24 * 60 * 60,
};

export const LIMITS = {
  freeDays: 3,        // сколько дней хранятся сообщения без Pro
  proDays: 30,        // сколько дней хранятся сообщения с Pro
  freeFeed: 10,       // сколько последних записей видно в истории без Pro
  proFeed: 100,       // сколько записей отдаёт история с Pro
  notifyPerDelete: 10, // если разом удалили больше сообщений — показываем первые и итог
  textMax: 3500,      // обрезаем слишком длинный текст в уведомлении
};

// Язык, если язык Telegram пользователя нам не знаком.
export const DEFAULT_LANG = 'en';
