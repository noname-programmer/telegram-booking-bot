// endpoints/export.js — выгрузка сохранённых сообщений в текстовый файл.
//   { chatId }     — один собеседник
//   { all: true }  — все собеседники одним файлом (полная выгрузка, для архива или переезда)
// Бот присылает файл в чат с пользователем. Только для Pro и VIP.

import { api, InputFile, EndpointError } from 'sdk';
import { LIMITS } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { chatHistory, getChat, listChats } from '../lib/store.js';
import { whoami, utf8 } from '../lib/app.js';

const pad = (n) => String(n).padStart(2, '0');
// Время в часовом поясе пользователя: 2026-11-15 14:35
function stamp(unix, tz) {
  const d = new Date((unix + tz * 60) * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default async function (input, ctx) {
  const { user, pro } = await whoami(ctx, input);
  if (!pro) throw new EndpointError(t(user.lang, 'needPro'), { code: 'NEED_PRO' });
  const lang = user.lang;
  const all = input.all === true;
  const chatId = Number(input.chatId);
  const chat = all ? null : await getChat(user.id, chatId);
  const rows = all ? await chatHistory(user.id, null, LIMITS.exportAllMax) : chat ? await chatHistory(user.id, chatId, LIMITS.exportMax) : [];
  if (!rows.length) throw new EndpointError(t(lang, 'exportEmpty'), { code: 'EMPTY' });

  const title = (c) => `Keeper · ${c.name}${c.username ? ` (@${c.username})` : ''} · ID ${c.chatId}`;
  const body = (list) => {
    const out = [];
    for (const r of list) {
      const kind = r.kind === 'text' ? '' : `[${t(lang, `kind_${r.kind}`)}] `;
      out.push(`[${stamp(r.date, user.tz)}] ${r.fromName}: ${kind}${r.text}`);
      for (const v of r.versions) out.push(`    ${t(lang, 'was').replace(/:$/, '')} (${stamp(v.at, user.tz)}): ${v.oldText}`);
      if (r.deletedAt) out.push(`    🗑 ${stamp(r.deletedAt, user.tz)}`);
    }
    return out;
  };

  let lines;
  if (all) {
    // Полная выгрузка: раздел на каждого собеседника.
    const known = new Map((await listChats(user.id)).map((c) => [c.chatId, c]));
    const groups = new Map();
    for (const r of rows) groups.set(r.chatId, [...(groups.get(r.chatId) ?? []), r]);
    lines = [];
    for (const [id, list] of groups) {
      lines.push(title(known.get(id) ?? { name: list[0].fromName, username: '', chatId: id }), '', ...body(list), '', '— — —', '');
    }
  } else {
    lines = [title(chat), '', ...body(rows)];
  }
  await api.sendDocument({
    chat_id: user.id,
    document: new InputFile(utf8(lines.join('\n')), all ? 'keeper-all.txt' : `keeper-${chat.username || chat.chatId}.txt`, { type: 'text/plain' }),
    caption: all ? t(lang, 'exportAllCaption') : t(lang, 'exportCaption', { name: chat.name }),
  });
  return { message: t(lang, 'exportDone'), count: rows.length };
}
