// endpoints/sendMedia.js — кнопка «Получить файл в чате» в мини-приложении:
// бот отправляет сохранённое фото, видео, голосовое или документ в чат с пользователем. Только для Pro и VIP.
//
// Фото, видео и кружки приходят ФАЙЛОМ без сжатия (до 20 МБ — больше Telegram ботам скачивать не даёт).
// Всё остальное и файлы крупнее пересылаются по ссылке Telegram: качество то же, размер не важен.

import { EndpointError } from 'sdk';
import { t } from '../lib/i18n.js';
import { getOwnFile, getOwnMessage } from '../lib/store.js';
import { sendMedia, sendAsFile } from '../lib/ui.js';
import { whoami, parseMeta } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx, input);
  if (!pro) throw new EndpointError(t(user.lang, 'needPro'), { code: 'NEED_PRO' });
  // Ищем только среди сообщений самого пользователя — чужую запись получить нельзя.
  // input.edit — номер правки, если нужен прежний файл, который при правке заменили.
  const edit = Number.isFinite(Number(input.edit)) && input.edit !== null && input.edit !== undefined ? Number(input.edit) : null;
  const row = await getOwnFile(user.id, Number(input.id), edit);
  if (!row) throw new EndpointError(t(user.lang, 'notFound'), { code: 'NOT_FOUND' });
  const date = (await getOwnMessage(user.id, Number(input.id)))?.date;

  if (await sendAsFile(user.id, { ...row, meta: parseMeta(row) }, date)) return { message: t(user.lang, 'sentFile'), asFile: true };
  if (!(await sendMedia(user.id, row))) throw new EndpointError(t(user.lang, 'notFound'), { code: 'FILE_GONE' });
  return { message: t(user.lang, 'sent'), asFile: false };
}
