// Когда код бота пишет `import ... from 'sdk'`, Node.js подставит наши файлы.
const MAP = {
  'sdk': './sdk.js',
  'sdk/api': './sdk.js',
  'sdk/fetch': './sdk.js',
  'sdk/db': './sdk-db.js',
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL(MAP[specifier], import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
