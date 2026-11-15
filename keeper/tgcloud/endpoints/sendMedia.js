// endpoints/sendMedia.js — кнопка «Получить файл в чате» в мини-приложении:
// бот отправляет сохранённое фото, видео, голосовое или документ в чат с пользователем. Только для Pro и VIP.
// Файл не скачивается: бот пересылает ссылку Telegram на него, поэтому размер не важен.

import { EndpointError } from 'sdk';
import { t } from '../lib/i18n.js';
import { getOwnFile } from '../lib/store.js';
import { sendMedia } from '../lib/ui.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx, input);
  if (!pro) throw new EndpointError(t(user.lang, 'needPro'), { code: 'NEED_PRO' });
  // Ищем только среди сообщений самого пользователя — чужую запись получить нельзя.
  // input.edit — номер правки, если нужен прежний файл, который при правке заменили.
  const edit = Number.isFinite(Number(input.edit)) && input.edit !== null && input.edit !== undefined ? Number(input.edit) : null;
  const row = await getOwnFile(user.id, Number(input.id), edit);
  if (!row) throw new EndpointError(t(user.lang, 'notFound'), { code: 'NOT_FOUND' });
  const ok = await sendMedia(user.id, row);
  if (!ok) throw new EndpointError(t(user.lang, 'notFound'), { code: 'FILE_GONE' });
  return { message: t(user.lang, 'sent') };
}
