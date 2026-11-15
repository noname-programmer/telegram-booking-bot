// endpoints/stats.js — аналитика пользователя для мини-приложения.
// input.tz — смещение часового пояса в минутах (его присылает само приложение).

import { analytics } from '../lib/store.js';
import { whoami } from '../lib/app.js';

export default async function (input, ctx) {
  const { user, profile } = await whoami(ctx, input);
  return { ...profile, ...(await analytics(user.id, input.tz)) };
}
