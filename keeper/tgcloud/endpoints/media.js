// endpoints/media.js — отдаёт сохранённое фото, видео или голосовое прямо в мини-приложение,
// чтобы его можно было посмотреть там, а не в чате. Только для Pro и VIP.
//   { id }               — сам файл (если он не больше LIMITS.inlineMedia)
//   { id, thumb: true }  — маленькое превью (для видео и файлов)
//   { id, edit }         — прежний файл, который заменили при правке (edit — номер правки)
//
// Большой файл сюда не попадает: сначала спрашиваем у Telegram размер, и только потом качаем,
// причём по кусочкам и с остановкой, если кусочков набралось больше лимита. Так endpoint не «зависнет»
// и не займёт память, даже если пришлют файл на сотни мегабайт.

import { api, BotApiError, EndpointError } from 'sdk';
import { LIMITS } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { getOwnFile } from '../lib/store.js';
import { whoami, mimeOf, base64 } from '../lib/app.js';

function parse(meta) {
  try { return meta ? JSON.parse(meta) : {}; } catch { return {}; }
}

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx, input);
  if (!pro) throw new EndpointError(t(user.lang, 'needPro'), { code: 'NEED_PRO' });
  const gone = (code) => new EndpointError(t(user.lang, 'notFound'), { code });
  const tooBig = () => new EndpointError(t(user.lang, 'tooBig'), { code: 'TOO_BIG' });

  // Ищем только среди сообщений самого пользователя — чужую запись получить нельзя.
  const edit = Number.isFinite(Number(input.edit)) && input.edit !== null && input.edit !== undefined ? Number(input.edit) : null;
  const file = await getOwnFile(user.id, Number(input.id), edit);
  if (!file) throw gone('NOT_FOUND');
  const meta = parse(file.meta);
  const fileId = input.thumb ? meta.thumb : file.fileId;
  if (!fileId) throw gone('NOT_FOUND');
  if (!input.thumb && (meta.size ?? 0) > LIMITS.inlineMedia) throw tooBig();

  const chunks = [];
  let total = 0;
  try {
    const stream = await api.getFileStream(fileId);
    if ((stream.file?.file_size ?? 0) > LIMITS.inlineMedia) throw tooBig();
    for await (const chunk of stream.body) {
      total += chunk.length;
      if (total > LIMITS.inlineMedia) throw tooBig();
      chunks.push(chunk);
    }
  } catch (e) {
    // Telegram хранит файлы не вечно, а файлы больше 20 МБ боту не отдаёт вовсе.
    if (e instanceof BotApiError) throw gone('FILE_GONE');
    throw e;
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return { mime: input.thumb ? 'image/jpeg' : mimeOf({ kind: file.kind }, meta), data: base64(bytes) };
}
