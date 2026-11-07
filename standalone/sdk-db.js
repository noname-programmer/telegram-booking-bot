// `sdk/db` платформы повторяет API Drizzle ORM, поэтому здесь — настоящий Drizzle.
export { sqliteTable as table, integer, text, real, blob, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export {
  eq, ne, gt, gte, lt, lte, like, notLike, isNull, isNotNull, and, or, not,
  between, notBetween, inArray, notInArray, count, sum, avg, min, max, asc, desc, sql,
} from 'drizzle-orm';
