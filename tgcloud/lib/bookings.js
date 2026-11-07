// lib/bookings.js — вся работа с записями в базе данных.
// Обработчики (handlers) не пишут SQL сами, а вызывают функции отсюда.

import { db } from 'sdk';
import { eq, and, gte, lte, asc, inArray } from 'sdk/db';
import { bookings, drafts } from '../schema.js';
import { SCHEDULE, SERVICES } from './config.js';
import { localNow, toIsoDate, toMinutes, fromMinutes } from './time.js';

export const findService = (id) => SERVICES.find((s) => s.id === id);

// Все рабочие слоты дня: ['10:00', '11:00', ...]
function allSlots() {
  const slots = [];
  const last = toMinutes(SCHEDULE.close) - SCHEDULE.slotMinutes;
  for (let m = toMinutes(SCHEDULE.open); m <= last; m += SCHEDULE.slotMinutes) {
    slots.push(fromMinutes(m));
  }
  return slots;
}

// Занятые слоты на список дат: { '2026-11-09': Set(['10:00', ...]) }
async function takenSlots(dates) {
  const rows = await db.select({ date: bookings.date, time: bookings.time })
    .from(bookings)
    .where(and(inArray(bookings.date, dates), eq(bookings.status, 'active')))
    .all();
  const map = {};
  for (const d of dates) map[d] = new Set();
  for (const r of rows) map[r.date].add(r.time);
  return map;
}

// Свободные слоты для нескольких дней сразу (одним запросом к базе).
export async function freeSlotsForDays(dates) {
  if (dates.length === 0) return {};
  const taken = await takenSlots(dates);
  const now = localNow();
  const today = toIsoDate(now);
  const earliest = now.getUTCHours() * 60 + now.getUTCMinutes() + SCHEDULE.minNoticeMinutes;

  const result = {};
  for (const date of dates) {
    result[date] = allSlots().filter((t) => {
      if (taken[date].has(t)) return false;
      if (date === today && toMinutes(t) < earliest) return false;
      return true;
    });
  }
  return result;
}

export async function isSlotFree(date, time) {
  const free = await freeSlotsForDays([date]);
  return free[date].includes(time);
}

// --- Черновик записи (шаг «жду телефон») ---

export async function saveDraft(userId, serviceId, date, time) {
  await db.insert(drafts)
    .values({ userId, serviceId, date, time, updated: new Date() })
    .onConflictDoUpdate({ target: drafts.userId, set: { serviceId, date, time, updated: new Date() } })
    .run();
}

export async function getDraft(userId) {
  return (await db.select().from(drafts).where(eq(drafts.userId, userId)).get()) ?? null;
}

export async function deleteDraft(userId) {
  await db.delete(drafts).where(eq(drafts.userId, userId)).run();
}

// --- Записи ---

// Создаёт запись. Возвращает её или null, если время успели занять.
export async function createBooking({ userId, clientName, phone, serviceId, date, time }) {
  if (!(await isSlotFree(date, time))) return null;
  try {
    await db.insert(bookings)
      .values({ userId, clientName, phone, serviceId, date, time, status: 'active' })
      .run();
  } catch (e) {
    // Уникальный индекс сработал: кто-то записался на это же время секундой раньше.
    if (!(await isSlotFree(date, time))) return null;
    throw e;
  }
  return db.select().from(bookings)
    .where(and(eq(bookings.date, date), eq(bookings.time, time), eq(bookings.status, 'active')))
    .get();
}

export async function getBooking(id) {
  return (await db.select().from(bookings).where(eq(bookings.id, id)).get()) ?? null;
}

export async function cancelBooking(id) {
  await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, id)).run();
}

// Будущие активные записи клиента.
export async function userUpcoming(userId) {
  const rows = await db.select().from(bookings)
    .where(and(
      eq(bookings.userId, userId),
      eq(bookings.status, 'active'),
      gte(bookings.date, toIsoDate(localNow())),
    ))
    .orderBy(asc(bookings.date), asc(bookings.time))
    .all();
  return rows.filter((b) => !isPast(b));
}

// Активные записи на день (для админа).
export async function dayBookings(date) {
  return db.select().from(bookings)
    .where(and(eq(bookings.date, date), eq(bookings.status, 'active')))
    .orderBy(asc(bookings.time))
    .all();
}

// Сколько активных записей по дням: { '2026-11-09': 3 }
export async function countByDay(dates) {
  const rows = await db.select({ date: bookings.date })
    .from(bookings)
    .where(and(
      gte(bookings.date, dates[0]),
      lte(bookings.date, dates[dates.length - 1]),
      eq(bookings.status, 'active'),
    ))
    .all();
  const counts = {};
  for (const r of rows) counts[r.date] = (counts[r.date] ?? 0) + 1;
  return counts;
}

export function isPast(b) {
  const now = localNow();
  const today = toIsoDate(now);
  if (b.date !== today) return b.date < today;
  return toMinutes(b.time) <= now.getUTCHours() * 60 + now.getUTCMinutes();
}
