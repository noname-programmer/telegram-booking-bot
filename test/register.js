// Подменяет модули платформы `sdk`, `sdk/db`, `sdk/api` на локальные заглушки.
import { register } from 'node:module';
register('./loader.js', import.meta.url);
