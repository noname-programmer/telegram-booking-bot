// Подменяет модули платформы на локальные заглушки.
// Если задана переменная BOT_CONFIG=examples/clinic.js — подставляет её вместо tgcloud/lib/config.js.
const MAP = {
  'sdk': './mock/sdk.js',
  'sdk/api': './mock/sdk.js',
  'sdk/db': './mock/sdk-db.js',
};
const CONFIG = process.env.BOT_CONFIG
  ? new URL(`../${process.env.BOT_CONFIG}`, import.meta.url).href
  : null;

export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL(MAP[specifier], import.meta.url).href, shortCircuit: true };
  const result = await next(specifier, context);
  if (CONFIG && result.url.endsWith('/tgcloud/lib/config.js')) return { ...result, url: CONFIG };
  return result;
}
