// handlers/message.js — обычные сообщения: команды, телефон клиента, кнопка «Отменить».

import { api } from 'sdk';
import { SERVICES, TEXTS } from '../lib/config.js';
import { upcomingDays } from '../lib/time.js';
import {
  getDraft, deleteDraft, createBooking, freeSlotsForDays, countByDay,
} from '../lib/bookings.js';
import {
  show, mainMenu, adminDaysScreen, timesScreen, notifyAdmins, isAdmin,
  removeKeyboard, summary, esc,
} from '../lib/ui.js';

// Похоже ли на номер телефона (если клиент ввёл его руками, а не кнопкой).
const PHONE_RE = /^\+?[\d\s\-()]{9,20}$/;

export default async function (message) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = (message.text ?? '').trim();

  // Бот работает только в личных сообщениях.
  if (message.chat.type !== 'private' || !userId) return;

  // 1. Клиент нажал «📱 Отправить номер».
  if (message.contact) {
    const c = message.contact;
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || message.from.first_name;
    return finishBooking(message, c.phone_number, name);
  }

  // 2. Команды.
  const command = text.split(/[\s@]/)[0];
  if (command === '/start' || command === '/menu') {
    return show(chatId, mainMenu(userId));
  }
  if (command === '/myid') {
    return api.sendMessage({
      chat_id: chatId,
      text: `Ваш Telegram ID: <code>${userId}</code>\n\nДобавьте его в ADMIN_IDS в файле tgcloud/lib/config.js, чтобы получить доступ к админке.`,
      parse_mode: 'HTML',
    });
  }
  if (command === '/admin') {
    if (!isAdmin(userId)) return show(chatId, mainMenu(userId));
    const days = upcomingDays();
    return show(chatId, adminDaysScreen(days, await countByDay(days)));
  }

  // 3. Клиент передумал на шаге с телефоном.
  if (text === '❌ Отменить') {
    await deleteDraft(userId);
    await api.sendMessage({ chat_id: chatId, text: 'Запись отменена.', reply_markup: removeKeyboard });
    return show(chatId, mainMenu(userId));
  }

  // 4. Клиент ввёл номер вручную (например, с компьютера, где нет кнопки контакта).
  if (PHONE_RE.test(text) && (await getDraft(userId))) {
    return finishBooking(message, text, message.from.first_name);
  }

  // 5. Всё остальное — показываем меню.
  return show(chatId, mainMenu(userId));
}

async function finishBooking(message, phone, clientName) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  const draft = await getDraft(userId);
  if (!draft || !SERVICES.some((s) => s.id === draft.serviceId)) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'Сначала выберите услугу и время 👇',
      reply_markup: removeKeyboard,
    });
    return show(chatId, mainMenu(userId));
  }

  const booking = await createBooking({
    userId,
    clientName: clientName || 'Клиент',
    phone,
    serviceId: draft.serviceId,
    date: draft.date,
    time: draft.time,
  });

  if (!booking) {
    // Пока клиент искал кнопку, это время кто-то занял — предлагаем другое.
    await api.sendMessage({
      chat_id: chatId,
      text: '😔 Извините, это время только что заняли. Выберите другое:',
      reply_markup: removeKeyboard,
    });
    const free = await freeSlotsForDays([draft.date]);
    return show(chatId, timesScreen(draft.serviceId, draft.date, free[draft.date]));
  }

  await deleteDraft(userId);

  const what = summary(booking.serviceId, booking.date, booking.time);

  await api.sendMessage({
    chat_id: chatId,
    text: `✅ <b>Вы записаны!</b>\n\n${what}\n\n${esc(TEXTS.booked)} Отменить запись можно в разделе «📋 Мои записи».`,
    parse_mode: 'HTML',
    reply_markup: removeKeyboard,
  });
  await show(chatId, mainMenu(userId));

  await notifyAdmins(
    `🆕 <b>Новая запись</b>\n\n${what}\n👤 ${esc(booking.clientName)}\n📞 ${esc(booking.phone)}`,
    { inline_keyboard: [[{ text: '❌ Отменить запись', callback_data: `adm:cancel:${booking.id}` }]] },
  );
}
