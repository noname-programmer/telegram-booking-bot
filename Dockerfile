# Запуск бота в Docker (без Telegram Serverless).
#   docker compose up -d --build
FROM node:22-slim

WORKDIR /app

# Сначала зависимости — так Docker кэширует их между сборками.
COPY standalone/package.json standalone/package-lock.json standalone/
RUN cd standalone && npm ci --omit=dev

COPY package.json ./
COPY tgcloud tgcloud
COPY standalone standalone

ENV NODE_ENV=production \
    DB_PATH=/app/data/bot.db
VOLUME /app/data

CMD ["node", "--import", "./standalone/register.js", "standalone/bot.js"]
