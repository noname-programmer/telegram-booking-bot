// handlers/business_connection.js — пользователь подключил бота к своему аккаунту,
// отключил его или изменил разрешения.

import { t } from '../lib/i18n.js';
import { REF } from '../lib/config.js';
import { getUser, saveConnection, getConnection, wipeUser, completeReferral } from '../lib/store.js';
import { send } from '../lib/ui.js';

export default async function onBusinessConnection(bc) {
  const before = await getConnection(bc.id);
  const conn = await saveConnection(bc);
  const user = await getUser(bc.user);

  if (conn.enabled && !before?.enabled) {
    await send(conn.userChatId, t(user.lang, 'connected'));
    // Если пользователя пригласил друг — друг получает дни Pro (один раз).
    const inviter = await completeReferral(user, REF.days);
    if (inviter) await send(inviter.id, t(inviter.lang, 'refReward', { days: REF.days }));
  } else if (!conn.enabled && (before?.enabled ?? 1)) {
    // Отключился — сразу стираем всё, что сохранили.
    await wipeUser(conn.userId);
    await send(conn.userChatId, t(user.lang, 'disconnected'));
  }
}
