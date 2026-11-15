// lib/app.js — общее для endpoints мини-приложения.

import { api, EndpointError } from 'sdk';
import { OWNER_ID, LIMITS, PRO, REF } from './config.js';
import { t } from './i18n.js';
import { getUser, isPro, isAdmin, isOwner, hasActiveConnection, countReferrals, checkPin } from './store.js';

// Имя бота (@username) нужно для ссылки-приглашения. Спрашиваем у Telegram один раз и запоминаем.
let botName = null;
async function botUsername() {
  if (botName === null) {
    try { botName = (await api.getMe())?.username ?? ''; } catch { botName = ''; }
  }
  return botName;
}

// Кто открыл мини-приложение (пользователь проверен платформой) и что ему доступно.
// input.pin — PIN-код, если пользователь его поставил: без верного PIN ни один endpoint ничего не отдаёт.
export async function whoami(ctx, input = {}) {
  const user = await getUser(ctx.initData.user);
  if (user.banned) throw new EndpointError(t(user.lang, 'banned'), { code: 'BANNED' });
  if (user.pin) {
    if (input.pin === undefined || input.pin === null || input.pin === '') throw new EndpointError('PIN', { code: 'LOCKED', lang: user.lang });
    const result = await checkPin(user, String(input.pin));
    if (result === 'wait') {
      throw new EndpointError(t(user.lang, 'pinWait', { min: Math.max(1, Math.ceil((user.pinLock - Math.floor(Date.now() / 1000)) / 60)) }), { code: 'PIN_WAIT', lang: user.lang });
    }
    if (result === 'wrong') throw new EndpointError(t(user.lang, 'pinWrong', { left: LIMITS.pinTries - user.pinFails }), { code: 'BAD_PIN', lang: user.lang });
  }
  const pro = isPro(user);
  const limit = pro ? LIMITS.proFeed : LIMITS.freeFeed;
  const owner = user.id === OWNER_ID;
  return {
    user, pro, limit,
    profile: {
      id: user.id, lang: user.lang, pro, proUntil: user.proUntil,
      // Тариф одним словом: owner | vip | pro | free.
      plan: owner ? 'owner' : user.vip ? 'vip' : pro ? 'pro' : 'free',
      notify: user.notify, favOnly: Boolean(user.favOnly),
      connected: await hasActiveConnection(user.id), admin: isAdmin(user), boss: isOwner(user),
      hasPin: Boolean(user.pin), weekly: Boolean(user.weekly), vault: user.vaultId ? (user.vaultTitle || '•') : '',
      keptLimit: pro ? LIMITS.proKept : LIMITS.freeKept, trialDays: PRO.trialDays,
      limit, freeDays: LIMITS.freeDays, proDays: LIMITS.proDays, proLimit: LIMITS.proFeed, stars: PRO.stars,
      bot: await botUsername(), refs: await countReferrals(user.id), refDays: REF.days,
      inlineMedia: LIMITS.inlineMedia,
    },
  };
}

export function requireAdmin(user) {
  if (!isAdmin(user)) throw new EndpointError('Forbidden', { code: 'FORBIDDEN' });
}

// То, что можно только владельцу (не помощнику): VIP, рассылка, цены, назначение помощников.
export function requireOwner(user) {
  if (!isOwner(user)) throw new EndpointError('Forbidden', { code: 'OWNER_ONLY' });
}

export function parseMeta(row) {
  try { return row.meta ? JSON.parse(row.meta) : {}; } catch { return {}; }
}

// Запись истории в том виде, в каком её получает мини-приложение.
export function toItem(r) {
  // Ссылку на превью наружу не отдаём — только признак, что оно есть.
  const { thumb, ...meta } = parseMeta(r);
  return {
    id: r.id, chatId: r.chatId, name: r.fromName, username: r.username ?? '', fromId: r.fromId ?? null,
    kind: r.kind, text: r.text, date: r.date, at: r.at,
    deletedAt: r.deletedAt ?? null, editedAt: r.editedAt ?? null,
    hasFile: Boolean(r.fileId), hasThumb: Boolean(thumb), kept: Boolean(r.kept),
    versions: r.versions.map((v) => ({ ...v, kind: v.kind === r.kind && !v.hasFile ? null : v.kind })),
    meta: Object.keys(meta).length ? meta : null,
  };
}

// Какой это тип файла — чтобы мини-приложение знало, показывать картинку, видео или звук.
export function mimeOf(row, meta) {
  switch (row.kind) {
    case 'photo': return 'image/jpeg';
    case 'voice': return meta.mime ?? 'audio/ogg';
    case 'video_note': return 'video/mp4';
    case 'video': case 'animation': return meta.mime ?? 'video/mp4';
    case 'audio': return meta.mime ?? 'audio/mpeg';
    case 'sticker': return meta.sticker === 'video' ? 'video/webm' : meta.sticker === 'animated' ? 'application/x-tgsticker' : 'image/webp';
    default: return meta.mime ?? 'application/octet-stream';
  }
}

// Превращает байты файла в текст (base64), чтобы передать его в мини-приложение внутри ответа.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out.push(
      B64[a >> 2],
      B64[((a & 3) << 4) | ((b ?? 0) >> 4)],
      b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)],
      c === undefined ? '=' : B64[c & 63],
    );
  }
  return out.join('');
}

// Превращает текст в байты UTF-8 (для файла выгрузки).
export function utf8(text) {
  const out = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
