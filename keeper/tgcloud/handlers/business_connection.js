// handlers/business_connection.js — пользователь подключил бота к своему аккаунту,
// отключил его или изменил разрешения.

import { t } from '../lib/i18n.js';
import { getUser, saveConnection, getConnection, wipeUser } from '../lib/store.js';
import { send } from '../lib/ui.js';

export default async function onBusinessConnection(bc) {
  const before = await getConnection(bc.id);
  const conn = await saveConnection(bc);
  const user = await getUser(bc.user);

  if (conn.enabled && !before?.enabled) {
    await send(conn.userChatId, t(user.lang, 'connected'));
  } else if (!conn.enabled && (before?.enabled ?? 1)) {
    // Отключился — сразу стираем всё, что сохранили.
    await wipeUser(conn.userId);
    await send(conn.userChatId, t(user.lang, 'disconnected'));
  }
}
