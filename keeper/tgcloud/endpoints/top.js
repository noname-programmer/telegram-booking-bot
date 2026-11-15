// endpoints/top.js — рейтинг пригласивших: кто привёл больше друзей, подключивших бота.
// Чужие имена показываем сокращённо (первые буквы), полное имя видит только сам человек.

import { REF } from '../lib/config.js';
import { refTop } from '../lib/store.js';
import { whoami } from '../lib/app.js';

const short = (name) => {
  const letters = Array.from(String(name || '?').trim());
  return letters.length > 3 ? `${letters.slice(0, 3).join('')}…` : letters.join('');
};

export default async function (input, ctx) {
  const { user, profile } = await whoami(ctx, input);
  const rows = await refTop(10);
  return {
    mine: profile.refs,
    prizes: REF.prizes,
    top: rows.map((r, i) => ({ place: i + 1, name: r.id === user.id ? r.name : short(r.name), n: r.n, me: r.id === user.id })),
  };
}
