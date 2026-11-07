// lib/time.js — работа с датами в часовом поясе бизнеса.
// Сервер живёт в UTC, поэтому сдвигаем время на utcOffsetHours
// и дальше читаем его через getUTC*-методы.

import { SCHEDULE } from './config.js';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const pad = (n) => String(n).padStart(2, '0');

// Текущее «местное» время бизнеса.
export function localNow() {
  return new Date(Date.now() + SCHEDULE.utcOffsetHours * 3600 * 1000);
}

// Date → 'YYYY-MM-DD'
export function toIsoDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// 'HH:MM' → минуты от полуночи
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// минуты от полуночи → 'HH:MM'
export function fromMinutes(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Список рабочих дней на ближайшие N дней (включая сегодня).
export function upcomingDays() {
  const now = localNow();
  const days = [];
  for (let i = 0; i < SCHEDULE.daysAhead; i++) {
    const d = new Date(now.getTime() + i * 86400 * 1000);
    if (SCHEDULE.daysOff.includes(d.getUTCDay())) continue;
    days.push(toIsoDate(d));
  }
  return days;
}

// 'YYYY-MM-DD' → 'Пн 09.11'
export function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${pad(d)}.${pad(m)}`;
}

// Компактная запись для кнопок: '2026-11-09' ↔ '20261109', '14:30' ↔ '1430'
export const packDate = (iso) => iso.replaceAll('-', '');
export const unpackDate = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
export const packTime = (hhmm) => hhmm.replace(':', '');
export const unpackTime = (s) => `${s.slice(0, 2)}:${s.slice(2, 4)}`;
