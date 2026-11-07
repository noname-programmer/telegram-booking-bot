const MAP = {
  'sdk': './mock/sdk.js',
  'sdk/api': './mock/sdk.js',
  'sdk/db': './mock/sdk-db.js',
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL(MAP[specifier], import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
