// endpoints/export.js — выгрузка сохранённых сообщений одного собеседника в текстовый файл.
// Бот присылает файл в чат с пользователем. Только для Pro и VIP.

import { api, InputFile, EndpointError } from 'sdk';
import { LIMITS } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { chatHistory, getChat } from '../lib/store.js';
import { whoami, utf8 } from '../lib/app.js';

const pad = (n) => String(n).padStart(2, '0');
// Время в часовом поясе пользователя: 2026-11-15 14:35
function stamp(unix, tz) {
  const d = new Date((unix + tz * 60) * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx);
  if (!pro) throw new EndpointError(t(user.lang, 'needPro'), { code: 'NEED_PRO' });
  const chatId = Number(input.chatId);
  const chat = await getChat(user.id, chatId);
  const rows = chat ? await chatHistory(user.id, chatId, LIMITS.exportMax) : [];
  if (!rows.length) throw new EndpointError(t(user.lang, 'exportEmpty'), { code: 'EMPTY' });

  const lang = user.lang;
  const lines = [`Keeper · ${chat.name}${chat.username ? ` (@${chat.username})` : ''} · ID ${chat.chatId}`, ''];
  for (const r of rows) {
    const kind = r.kind === 'text' ? '' : `[${t(lang, `kind_${r.kind}`)}] `;
    lines.push(`[${stamp(r.date, user.tz)}] ${r.fromName}: ${kind}${r.text}`);
    for (const v of r.versions) lines.push(`    ${t(lang, 'was').replace(/:$/, '')} (${stamp(v.at, user.tz)}): ${v.oldText}`);
    if (r.deletedAt) lines.push(`    🗑 ${stamp(r.deletedAt, user.tz)}`);
  }
  const name = `keeper-${chat.username || chat.chatId}.txt`;
  await api.sendDocument({
    chat_id: user.id,
    document: new InputFile(utf8(lines.join('\n')), name, { type: 'text/plain' }),
    caption: t(lang, 'exportCaption', { name: chat.name }),
  });
  return { message: t(lang, 'exportDone'), count: rows.length };
}
