// handlers/callback_query.js — нажатия на inline-кнопки.
// Формат callback_data описан в начале lib/ui.js.

import { api } from 'sdk';
import { TEXTS } from '../lib/config.js';
import {
  upcomingDays, unpackDate, unpackTime,
} from '../lib/time.js';
import {
  findService, freeSlotsForDays, isSlotFree, saveDraft, getBooking, cancelBooking,
  userUpcoming, dayBookings, countByDay, isPast,
} from '../lib/bookings.js';
import {
  show, mainMenu, servicesScreen, daysScreen, timesScreen, myBookingsScreen, infoScreen,
  adminDaysScreen, adminDayScreen, askContactKeyboard, notifyAdmins, isAdmin,
  summary, esc,
} from '../lib/ui.js';

export default async function (query) {
  const userId = query.from.id;
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const [action, ...args] = (query.data ?? '').split(':');

  // Всплывающее уведомление; по умолчанию просто убираем «часики» с кнопки.
  let toast = '';

  try {
    if (!chatId) return;

    if (action === 'menu') {
      await show(chatId, mainMenu(userId), messageId);
    } else if (action === 'book') {
      await show(chatId, servicesScreen(), messageId);
    } else if (action === 'svc') {
      toast = await onService(chatId, messageId, args);
    } else if (action === 'day') {
      toast = await onDay(chatId, messageId, args);
    } else if (action === 'time') {
      toast = await onTime(chatId, messageId, userId, args);
    } else if (action === 'my') {
      await show(chatId, myBookingsScreen(await userUpcoming(userId)), messageId);
    } else if (action === 'cancel') {
      toast = await onClientCancel(chatId, messageId, userId, Number(args[0]));
    } else if (action === 'info') {
      await show(chatId, infoScreen(), messageId);
    } else if (action === 'adm') {
      toast = isAdmin(userId)
        ? await onAdmin(chatId, messageId, args)
        : '⛔ Нет доступа';
    }
  } finally {
    // Telegram ждёт ответа на каждое нажатие, иначе кнопка «зависает».
    await api.answerCallbackQuery({ callback_query_id: query.id, text: toast || undefined });
  }
}

// --- Клиент ---

async function onService(chatId, messageId, [serviceId]) {
  if (!findService(serviceId)) return 'Услуга не найдена';
  const free = await freeSlotsForDays(upcomingDays());
  await show(chatId, daysScreen(serviceId, free), messageId);
  return '';
}

async function onDay(chatId, messageId, [serviceId, packedDate]) {
  const date = unpackDate(packedDate ?? '');
  if (!findService(serviceId) || !upcomingDays().includes(date)) {
    await show(chatId, servicesScreen(), messageId);
    return 'Этот день уже недоступен';
  }
  const free = await freeSlotsForDays([date]);
  await show(chatId, timesScreen(serviceId, date, free[date]), messageId);
  return '';
}

async function onTime(chatId, messageId, userId, [serviceId, packedDate, packedTime]) {
  const date = unpackDate(packedDate ?? '');
  const time = unpackTime(packedTime ?? '');

  if (!findService(serviceId) || !upcomingDays().includes(date) || !(await isSlotFree(date, time))) {
    const free = await freeSlotsForDays([date]);
    await show(chatId, timesScreen(serviceId, date, free[date] ?? []), messageId);
    return 'Это время уже занято, выберите другое';
  }

  await saveDraft(userId, serviceId, date, time);

  await show(chatId, {
    text: summary(serviceId, date, time),
    reply_markup: { inline_keyboard: [] },
  }, messageId);

  await api.sendMessage({
    chat_id: chatId,
    text: `Остался последний шаг: нажмите кнопку <b>«📱 Отправить номер»</b> внизу экрана, ${esc(TEXTS.contactReason)}.\n\nМожно и просто написать номер сообщением.`,
    parse_mode: 'HTML',
    reply_markup: askContactKeyboard,
  });
  return '';
}

async function onClientCancel(chatId, messageId, userId, bookingId) {
  const b = await getBooking(bookingId);
  if (!b || b.userId !== userId || b.status !== 'active' || isPast(b)) {
    await show(chatId, myBookingsScreen(await userUpcoming(userId)), messageId);
    return 'Эту запись уже нельзя отменить';
  }

  await cancelBooking(b.id);
  await show(chatId, myBookingsScreen(await userUpcoming(userId)), messageId);
  await notifyAdmins(
    `🚫 <b>Клиент отменил запись</b>\n\n${summary(b.serviceId, b.date, b.time)}\n👤 ${esc(b.clientName)} · 📞 ${esc(b.phone)}`,
  );
  return 'Запись отменена';
}

// --- Админ ---

async function onAdmin(chatId, messageId, [sub, arg]) {
  if (!sub) {
    const days = upcomingDays();
    await show(chatId, adminDaysScreen(days, await countByDay(days)), messageId);
    return '';
  }

  if (sub === 'day') {
    const date = unpackDate(arg ?? '');
    await show(chatId, adminDayScreen(date, await dayBookings(date)), messageId);
    return '';
  }

  if (sub === 'cancel') {
    const b = await getBooking(Number(arg));
    if (!b || b.status !== 'active') return 'Запись уже отменена';

    await cancelBooking(b.id);
    try {
      await api.sendMessage({
        chat_id: b.userId,
        text: `😔 К сожалению, ваша запись отменена администратором:\n\n${summary(b.serviceId, b.date, b.time)}\n\nВыберите другое время: /start`,
        parse_mode: 'HTML',
      });
    } catch (e) {
      console.warn('Не удалось уведомить клиента', b.userId, e.description ?? e.message);
    }
    await show(chatId, adminDayScreen(b.date, await dayBookings(b.date)), messageId);
    return 'Запись отменена, клиент уведомлён';
  }

  if (sub === 'remind') {
    const date = unpackDate(arg ?? '');
    const list = (await dayBookings(date)).filter((b) => !isPast(b));
    let sent = 0;
    for (const b of list) {
      try {
        await api.sendMessage({
          chat_id: b.userId,
          text: `⏰ <b>Напоминаем о записи</b>\n\n${summary(b.serviceId, b.date, b.time)}\n\nЕсли планы изменились — отмените запись в разделе «📋 Мои записи».`,
          parse_mode: 'HTML',
        });
        sent++;
      } catch (e) {
        console.warn('Не удалось напомнить', b.userId, e.description ?? e.message);
      }
    }
    return `Напоминаний отправлено: ${sent} из ${list.length}`;
  }

  return '';
}
