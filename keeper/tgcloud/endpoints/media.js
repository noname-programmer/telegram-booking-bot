// endpoints/media.js — отдаёт сохранённое фото, видео или голосовое прямо в мини-приложение,
// чтобы его можно было посмотреть там, а не в чате. Только для Pro и VIP.
//   { id }               — сам файл, в исходном виде, без сжатия
//   { id, part: 2 }      — третья часть большого файла (части считаются с нуля)
//   { id, thumb: true }  — маленькое превью (для галереи, видео и файлов)
//   { id, edit }         — прежний файл, который заменили при правке (edit — номер правки)
//
// Файл едет частями по LIMITS.mediaChunk: ответ всегда небольшой, а приложение склеивает части обратно.
// Сначала спрашиваем у Telegram размер; читаем по кусочкам и останавливаемся, как только набрали нужную часть.
// Поэтому даже очень большой файл не «подвесит» endpoint и не займёт память.

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

  const chunk = LIMITS.mediaChunk;
  const part = Number.isInteger(input.part) && input.part > 0 ? input.part : 0;
  const from = part * chunk;      // с какого байта начинается нужная часть
  const to = from + chunk;        // и на каком заканчивается
  const pieces = [];
  let seen = 0;                   // сколько байт файла уже прошло мимо нас
  let size = 0;                   // полный размер файла
  try {
    const stream = await api.getFileStream(fileId);
    size = stream.file?.file_size ?? 0;
    if (size > LIMITS.inlineMedia) throw tooBig();
    for await (const bytes of stream.body) {
      const start = seen;
      seen += bytes.length;
      if (seen > LIMITS.inlineMedia) throw tooBig();
      // Берём из кусочка только то, что попадает в нужную часть.
      if (seen > from && start < to) pieces.push(bytes.subarray(Math.max(0, from - start), Math.min(bytes.length, to - start)));
      if (seen >= to && size) break; // нужная часть набрана, полный размер известен — дальше можно не читать
    }
  } catch (e) {
    // Telegram хранит файлы не вечно, а файлы больше 20 МБ боту не отдаёт вовсе.
    if (e instanceof BotApiError) throw gone('FILE_GONE');
    throw e;
  }
  if (!size) size = seen; // Telegram не сказал размер заранее — значит, мы дочитали файл до конца и знаем его
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of pieces) { out.set(p, at); at += p.length; }
  return {
    mime: input.thumb ? 'image/jpeg' : mimeOf({ kind: file.kind }, meta),
    data: base64(out), part, parts: Math.max(1, Math.ceil(size / chunk)), size,
  };
}
