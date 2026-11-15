// schema.js — таблицы базы данных.
// После изменения этого файла: `npx tgcloud push`, затем `npx tgcloud migrate`.
// Время везде хранится числом: секунды с 1970 года (unix time).

import { table, integer, text, index, uniqueIndex } from 'sdk/db';

// Пользователи бота.
export const users = table('users', {
  id:       integer('id').primaryKey(),               // Telegram ID
  lang:     text('lang').notNull().default('en'),     // 'ru' | 'uz' | 'en'
  proUntil: integer('pro_until').notNull().default(0), // до какого времени оплачен Pro
  created:  integer('created_at').notNull().default(0),
});

// Подключения бота к аккаунтам (Telegram Business).
export const connections = table('connections', {
  id:         text('id').primaryKey(),                // id подключения от Telegram
  userId:     integer('user_id').notNull(),           // чей аккаунт
  userChatId: integer('user_chat_id').notNull(),      // куда писать владельцу
  enabled:    integer('enabled').notNull().default(1), // 1 — подключён, 0 — отключён
  updated:    integer('updated_at').notNull().default(0),
}, (t) => ({
  byUser: index('idx_connections_user').on(t.userId),
}));

// Сообщения собеседников. Свои сообщения владельца не храним.
export const messages = table('messages', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  connId:    text('conn_id').notNull(),
  ownerId:   integer('owner_id').notNull(),           // владелец аккаунта
  chatId:    integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  fromName:  text('from_name').notNull(),
  date:      integer('date').notNull(),
  kind:      text('kind').notNull(),                  // 'text' | 'photo' | 'video' | ...
  text:      text('text').notNull().default(''),      // текст или подпись к медиа
  fileId:    text('file_id'),                         // ссылка Telegram на файл, если это медиа
  deletedAt: integer('deleted_at'),                   // когда удалено (пусто — не удалено)
  editedAt:  integer('edited_at'),                    // когда последний раз изменено
}, (t) => ({
  oneMessage: uniqueIndex('uidx_messages_key').on(t.connId, t.chatId, t.messageId),
  byOwnerDeleted: index('idx_messages_owner_deleted').on(t.ownerId, t.deletedAt),
  byOwnerEdited: index('idx_messages_owner_edited').on(t.ownerId, t.editedAt),
  byDate: index('idx_messages_date').on(t.date),
}));

// История правок: что было в сообщении до изменения.
export const edits = table('edits', {
  id:      integer('id').primaryKey({ autoIncrement: true }),
  msgId:   integer('msg_id').notNull(),               // messages.id
  ownerId: integer('owner_id').notNull(),
  oldText: text('old_text').notNull().default(''),
  at:      integer('at').notNull(),
}, (t) => ({
  byMsg: index('idx_edits_msg').on(t.msgId),
  byOwner: index('idx_edits_owner').on(t.ownerId),
}));

// Оплаты звёздами.
export const payments = table('payments', {
  chargeId: text('charge_id').primaryKey(),           // номер платежа от Telegram
  userId:   integer('user_id').notNull(),
  stars:    integer('stars').notNull(),
  at:       integer('at').notNull(),
});
