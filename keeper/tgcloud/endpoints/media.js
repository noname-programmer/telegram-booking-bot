// endpoints/media.js — отдаёт сохранённое фото, видео или голосовое прямо в мини-приложение,
// чтобы его можно было посмотреть там, а не в чате. Только для Pro и VIP.
//   { id }               — сам файл (если он не больше LIMITS.inlineMedia)
//   { id, thumb: true }  — маленькое превью (для видео и файлов)

import { api, BotApiError, EndpointError } from 'sdk';
import { LIMITS } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { getOwnMessage } from '../lib/store.js';
import { whoami, parseMeta, mimeOf, base64 } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx);
  if (!pro) throw new EndpointError(t(user.lang, 'needPro'), { code: 'NEED_PRO' });
  // Ищем только среди сообщений самого пользователя — чужую запись получить нельзя.
  const row = await getOwnMessage(user.id, Number(input.id));
  if (!row?.fileId) throw new EndpointError(t(user.lang, 'notFound'), { code: 'NOT_FOUND' });
  const meta = parseMeta(row);
  const fileId = input.thumb ? meta.thumb : row.fileId;
  if (!fileId) throw new EndpointError(t(user.lang, 'notFound'), { code: 'NOT_FOUND' });
  const tooBig = () => new EndpointError(t(user.lang, 'tooBig'), { code: 'TOO_BIG' });
  if (!input.thumb && (meta.size ?? 0) > LIMITS.inlineMedia) throw tooBig();

  let bytes;
  try {
    bytes = await api.getFileContent(fileId);
  } catch (e) {
    // Telegram хранит файлы не вечно: старый файл может уже не отдаваться.
    if (e instanceof BotApiError) throw new EndpointError(t(user.lang, 'notFound'), { code: 'FILE_GONE' });
    throw e;
  }
  if (bytes.length > LIMITS.inlineMedia) throw tooBig();
  return { mime: input.thumb ? 'image/jpeg' : mimeOf(row, meta), data: base64(bytes) };
}
