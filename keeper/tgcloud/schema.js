// schema.js — таблицы базы данных.
// После изменения этого файла: `npx tgcloud push`, затем `npx tgcloud migrate`.
// Время везде хранится числом: секунды с 1970 года (unix time).

import { table, integer, text, index, uniqueIndex } from 'sdk/db';

// Пользователи бота.
export const users = table('users', {
  id:       integer('id').primaryKey(),               // Telegram ID
  lang:     text('lang').notNull().default('en'),     // 'ru' | 'uz' | 'en'
  proUntil: integer('pro_until').notNull().default(0), // до какого времени оплачен Pro
  name:     text('name').notNull().default(''),       // имя из Telegram (для админ-панели)
  username: text('username').notNull().default(''),
  // Режим уведомлений: 0 тихо, 1 полные, 2 короткие, 3 сводка раз в день. Новым пользователям код ставит 0 (тихо);
  // значение «по умолчанию 1» осталось в базе с первой версии, менять его база сама не умеет.
  notify:   integer('notify').notNull().default(1),
  favOnly:  integer('fav_only').notNull().default(0), // 1 — уведомлять только об избранных собеседниках
  vip:      integer('vip').notNull().default(0),      // 1 — бессрочный VIP (выдаёт владелец)
  trial:    integer('trial').notNull().default(0),    // 1 — пробный Pro уже выдан
  tz:       integer('tz').notNull().default(300),     // часовой пояс в минутах (Ташкент = 300), нужен для сводки
  refBy:    integer('ref_by'),                        // кто пригласил
  refDone:  integer('ref_done').notNull().default(0), // 1 — пригласивший уже получил награду
  digestDay: integer('digest_day').notNull().default(0), // сводка: за какой день копим счётчики
  digestDel: integer('digest_del').notNull().default(0),
  digestEd:  integer('digest_ed').notNull().default(0),
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
  fromId:    integer('from_id'),                      // Telegram ID отправителя
  username:  text('username'),                        // его @username, если есть
  meta:      text('meta'),                            // подробности в формате JSON: размер файла, длительность, пересылка…
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

// Чаты пользователя: по одной строке на собеседника. Счётчики копятся за всё время,
// даже когда сами сообщения уже стёрты по сроку хранения.
export const chats = table('chats', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  ownerId:  integer('owner_id').notNull(),
  chatId:   integer('chat_id').notNull(),             // Telegram ID собеседника
  name:     text('name').notNull().default(''),
  username: text('username').notNull().default(''),
  saved:    integer('saved').notNull().default(0),    // сколько сообщений собеседника увидел бот
  deleted:  integer('deleted').notNull().default(0),  // сколько из них удалено
  edited:   integer('edited').notNull().default(0),   // сколько правок
  muted:    integer('muted').notNull().default(0),    // 1 — не присылать уведомления по этому чату
  fav:      integer('fav').notNull().default(0),      // 1 — избранный собеседник
  firstAt:  integer('first_at').notNull().default(0),
  lastAt:   integer('last_at').notNull().default(0),  // последнее сообщение
  eventAt:  integer('event_at').notNull().default(0), // последнее удаление или правка
}, (t) => ({
  oneChat: uniqueIndex('uidx_chats_key').on(t.ownerId, t.chatId),
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
