# Запуск бота в Docker (без Telegram Serverless).
#   docker compose up -d --build

# Этап 1: установка зависимостей. better-sqlite3 собирается из исходников,
# для этого нужны Python и компилятор — они остаются только на этом этапе.
FROM node:22-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY standalone/package.json standalone/package-lock.json standalone/
RUN cd standalone && npm ci --omit=dev

# Этап 2: сам бот — лёгкий образ без инструментов сборки.
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/standalone/node_modules standalone/node_modules

COPY package.json ./
COPY tgcloud tgcloud
COPY standalone standalone

ENV NODE_ENV=production \
    DB_PATH=/app/data/bot.db
VOLUME /app/data

CMD ["node", "--import", "./standalone/register.js", "standalone/bot.js"]
