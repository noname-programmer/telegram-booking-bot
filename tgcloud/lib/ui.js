// lib/ui.js — тексты и клавиатуры бота.
// Формат callback_data у кнопок (Telegram ограничивает его 64 байтами):
//   menu                      — главное меню
//   book                      — выбор услуги
//   svc:<serviceId>           — выбор дня
//   day:<serviceId>:<YYYYMMDD>         — выбор времени
//   time:<serviceId>:<YYYYMMDD>:<HHMM> — подтверждение
//   my                        — мои записи
//   cancel:<bookingId>        — клиент отменяет запись
//   info                      — контакты
//   adm                       — админка: список дней
//   adm:day:<YYYYMMDD>        — записи на день
//   adm:cancel:<bookingId>    — админ отменяет запись
//   adm:remind:<YYYYMMDD>     — разослать напоминания на день

import { api, BotApiError } from 'sdk';
import { BUSINESS, SERVICES, CURRENCY, ADMIN_IDS } from './config.js';
import { prettyDate, packDate, packTime } from './time.js';
import { findService } from './bookings.js';

export const isAdmin = (userId) => ADMIN_IDS.includes(userId);

// 120000 → '120 000 сум'. Без toLocaleString: в облачной песочнице может не быть локалей.
export const money = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${CURRENCY}`;

// Экранирование для parse_mode: 'HTML' — чтобы имя клиента вида "<b>" не сломало разметку.
export const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const btn = (text, data) => ({ text, callback_data: data });
const backTo = (data) => [btn('⬅️ Назад', data)];

// Разбивает массив кнопок на ряды по N штук.
function rows(buttons, perRow) {
  const out = [];
  for (let i = 0; i < buttons.length; i += perRow) out.push(buttons.slice(i, i + perRow));
  return out;
}

export function serviceLine(serviceId) {
  const s = findService(serviceId);
  return s ? `${s.title} — ${money(s.price)}` : serviceId;
}

export function bookingLine(b, { withClient = false } = {}) {
  const s = findService(b.serviceId);
  let line = `🕐 <b>${b.time}</b> · ${esc(s ? s.title : b.serviceId)}`;
  if (withClient) line += `\n     👤 ${esc(b.clientName)} · 📞 ${esc(b.phone)}`;
  return line;
}

// --- Экраны ---

export function mainMenu(userId) {
  const keyboard = [
    [btn('📅 Записаться', 'book')],
    [btn('📋 Мои записи', 'my'), btn('📍 Контакты', 'info')],
  ];
  if (isAdmin(userId)) keyboard.push([btn('🛠 Админка', 'adm')]);
  return {
    text: `Здравствуйте! Это бот <b>${esc(BUSINESS.name)}</b>.\n\nЗдесь можно записаться за 30 секунд — без звонков.`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

export function servicesScreen() {
  const keyboard = SERVICES.map((s) => [btn(`${s.title} · ${money(s.price)}`, `svc:${s.id}`)]);
  keyboard.push(backTo('menu'));
  return { text: '✂️ Выберите услугу:', reply_markup: { inline_keyboard: keyboard } };
}

export function daysScreen(serviceId, freeByDay) {
  const dayButtons = Object.entries(freeByDay)
    .filter(([, slots]) => slots.length > 0)
    .map(([date]) => btn(prettyDate(date), `day:${serviceId}:${packDate(date)}`));

  const keyboard = rows(dayButtons, 3);
  keyboard.push(backTo('book'));
  const text = dayButtons.length
    ? `${esc(serviceLine(serviceId))}\n\n📅 Выберите день:`
    : '😔 На ближайшие дни свободного времени нет. Попробуйте позже или позвоните нам.';
  return { text, reply_markup: { inline_keyboard: keyboard } };
}

export function timesScreen(serviceId, date, slots) {
  const keyboard = rows(
    slots.map((t) => btn(t, `time:${serviceId}:${packDate(date)}:${packTime(t)}`)),
    4,
  );
  keyboard.push(backTo(`svc:${serviceId}`));
  const text = slots.length
    ? `${esc(serviceLine(serviceId))}\n📅 ${prettyDate(date)}\n\n🕐 Выберите время:`
    : 'На этот день всё занято. Выберите другой день.';
  return { text, reply_markup: { inline_keyboard: keyboard } };
}

// Обычная (не inline) клавиатура с кнопкой «Отправить номер».
export const askContactKeyboard = {
  keyboard: [
    [{ text: '📱 Отправить номер', request_contact: true }],
    [{ text: '❌ Отменить' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export const removeKeyboard = { remove_keyboard: true };

export function myBookingsScreen(list) {
  if (list.length === 0) {
    return {
      text: 'У вас пока нет активных записей.',
      reply_markup: { inline_keyboard: [[btn('📅 Записаться', 'book')], backTo('menu')] },
    };
  }
  const text = '📋 <b>Ваши записи:</b>\n\n' + list
    .map((b) => `📅 ${prettyDate(b.date)}  ${bookingLine(b)}`)
    .join('\n');
  const keyboard = list.map((b) => [btn(`❌ Отменить ${prettyDate(b.date)} ${b.time}`, `cancel:${b.id}`)]);
  keyboard.push(backTo('menu'));
  return { text, reply_markup: { inline_keyboard: keyboard } };
}

export function infoScreen() {
  let text = `📍 <b>${esc(BUSINESS.name)}</b>\n\n🏠 ${esc(BUSINESS.address)}\n📞 ${esc(BUSINESS.phone)}`;
  if (BUSINESS.mapUrl) text += `\n🗺 <a href="${esc(BUSINESS.mapUrl)}">Открыть на карте</a>`;
  return { text, reply_markup: { inline_keyboard: [backTo('menu')] } };
}

export function adminDaysScreen(days, counts) {
  const keyboard = rows(
    days.map((d) => btn(`${prettyDate(d)} (${counts[d] ?? 0})`, `adm:day:${packDate(d)}`)),
    2,
  );
  keyboard.push(backTo('menu'));
  return {
    text: '🛠 <b>Админка</b>\n\nВыберите день. В скобках — количество записей.',
    reply_markup: { inline_keyboard: keyboard },
  };
}

export function adminDayScreen(date, list) {
  const header = `🛠 <b>Записи на ${prettyDate(date)}</b>\n\n`;
  const text = list.length
    ? header + list.map((b) => bookingLine(b, { withClient: true })).join('\n\n')
    : header + 'Записей нет.';
  const keyboard = list.map((b) => [btn(`❌ Отменить ${b.time} — ${b.clientName}`.slice(0, 60), `adm:cancel:${b.id}`)]);
  if (list.length) keyboard.push([btn('📣 Напомнить клиентам', `adm:remind:${packDate(date)}`)]);
  keyboard.push(backTo('adm'));
  return { text, reply_markup: { inline_keyboard: keyboard } };
}

// --- Отправка ---

// Показывает экран: редактирует текущее сообщение (если есть) или шлёт новое.
export async function show(chatId, screen, messageId) {
  const params = {
    chat_id: chatId,
    text: screen.text,
    parse_mode: 'HTML',
    reply_markup: screen.reply_markup,
    link_preview_options: { is_disabled: true },
  };
  if (messageId) {
    try {
      await api.editMessageText({ ...params, message_id: messageId });
      return;
    } catch (e) {
      // «message is not modified» — экран уже такой, ничего делать не нужно.
      if (e instanceof BotApiError && /not modified/i.test(e.description ?? '')) return;
      // Сообщение слишком старое или удалено — просто отправим новое.
      if (!(e instanceof BotApiError)) throw e;
    }
  }
  await api.sendMessage(params);
}

// Сообщение всем администраторам. Ошибка одному админу не мешает остальным.
export async function notifyAdmins(text, reply_markup) {
  for (const id of ADMIN_IDS) {
    try {
      await api.sendMessage({ chat_id: id, text, parse_mode: 'HTML', reply_markup });
    } catch (e) {
      console.warn('Не удалось уведомить админа', id, e.description ?? e.message);
    }
  }
}
