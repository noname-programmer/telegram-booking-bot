// schema.js — таблицы базы данных.
// После изменения этого файла: `npx tgcloud push`, затем `npx tgcloud migrate`.

import { table, integer, text, index, uniqueIndex, sql } from 'sdk/db';

// Записи клиентов.
export const bookings = table('bookings', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),         // Telegram ID клиента
  clientName: text('client_name').notNull(),
  phone:      text('phone').notNull(),
  serviceId:  text('service_id').notNull(),         // id услуги из lib/config.js
  date:       text('date').notNull(),               // 'YYYY-MM-DD'
  time:       text('time').notNull(),               // 'HH:MM'
  status:     text('status').notNull().default('active'), // 'active' | 'cancelled'
  created:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  // Защита от двойной записи: на одно время может быть только одна активная запись.
  oneActivePerSlot: uniqueIndex('uidx_bookings_slot')
    .on(t.date, t.time)
    .where(sql`status = 'active'`),
  byUser: index('idx_bookings_user').on(t.userId),
  byDate: index('idx_bookings_date').on(t.date),
}));

// Незаконченная запись: клиент выбрал услугу и время, но ещё не отправил телефон.
// Serverless-функция не помнит ничего между сообщениями, поэтому храним шаг в базе.
export const drafts = table('drafts', {
  userId:    integer('user_id').primaryKey(),
  serviceId: text('service_id').notNull(),
  date:      text('date').notNull(),
  time:      text('time').notNull(),
  updated:   integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
