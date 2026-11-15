// handlers/my_chat_member.js — бота добавили в канал (или группу) либо убрали оттуда.
// Так подключается «сейф»: пользователь создаёт свой закрытый канал, добавляет туда бота админом —
// и бот начинает копировать в этот канал удалённые фото, видео и файлы.

import { t } from '../lib/i18n.js';
import { getUser, setVault, clearVault } from '../lib/store.js';
import { send, esc } from '../lib/ui.js';

export default async function onMyChatMember(update) {
  const chat = update.chat;
  if (!chat || chat.type === 'private') return; // личные чаты (блокировка бота и т. п.) нас здесь не интересуют
  const status = update.new_chat_member?.status;
  const member = update.new_chat_member ?? {};
  // В канале бот может писать, только если он админ с правом публикации; в группе — если он участник.
  const canPost = chat.type === 'channel'
    ? status === 'administrator' && member.can_post_messages !== false
    : status === 'administrator' || status === 'member';

  if (!canPost) {
    await clearVault(chat.id);
    return;
  }
  if (!update.from || update.from.is_bot) return;
  const user = await getUser(update.from);
  if (user.banned) return;
  await setVault(user.id, chat.id, chat.title);
  await send(user.id, t(user.lang, 'vaultOn', { title: esc(chat.title ?? '') }));
}
