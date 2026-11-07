// Подключает loader.js: вместо платформенного `sdk` код бота получит ./sdk.js.
import { register } from 'node:module';
register('./loader.js', import.meta.url);
