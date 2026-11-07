<div align="center">

# 📅 Telegram Booking Bot

**Универсальный бот онлайн-записи для любого бизнеса: от барбершопа до клиники**

Клиент записывается в 4 нажатия. Владелец сразу получает уведомление.
Сервер не нужен: бот работает на [Telegram Serverless](https://core.telegram.org/bots/serverless).

[![Tests](https://github.com/noname-programmer/telegram-booking-bot/actions/workflows/test.yml/badge.svg)](https://github.com/noname-programmer/telegram-booking-bot/actions/workflows/test.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?logo=javascript&logoColor=black)
![Telegram](https://img.shields.io/badge/Telegram-Serverless-26a5e4?logo=telegram&logoColor=white)
![SQLite](https://img.shields.io/badge/DB-SQLite-003b57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**[▶️ Открыть демо: @schedule_mkapp](https://t.me/schedule_mkapp)**

<img src="docs/preview.png" alt="Интерфейс бота: выбор услуги, времени и уведомление администратору" width="100%">

</div>

---

## 💡 Для какого бизнеса

Бот не привязан к конкретной сфере. Название, услуги, цены, график и все тексты задаются в **одном файле**. В папке [`examples/`](examples) лежат готовые настройки:

| | Бизнес | Пример настроек |
|---|---|---|
| ✂️ | Барбершоп, салон красоты | [`barbershop.js`](examples/barbershop.js) |
| 🦷 | Стоматология, клиника | [`clinic.js`](examples/clinic.js) |
| 🚗 | Автомойка, автосервис | [`carwash.js`](examples/carwash.js) |
| 📚 | Учебный центр, репетитор | [`tutor.js`](examples/tutor.js) |

Подходит и для фотостудий, массажа, юристов, психологов, коворкингов: везде, где клиент выбирает время.

## ✨ Возможности

<table>
<tr>
<td width="50%" valign="top">

### 👤 Клиент
- 📅 Запись: услуга → день → время → телефон
- 🕐 Показываются только свободные слоты
- 📱 Номер одной кнопкой (или вручную текстом)
- 📋 «Мои записи»: просмотр и отмена
- 📍 Адрес, телефон и карта

</td>
<td width="50%" valign="top">

### 🛠 Владелец (админка в боте)
- 🔔 Уведомления о новых записях и отменах
- 🗓 Записи на любой день с телефонами
- ❌ Отмена с автоматическим сообщением клиенту
- 📣 Напоминания всем клиентам дня одной кнопкой
- 👥 Несколько администраторов

</td>
</tr>
</table>

### 🔒 Надёжность
- **Двойная запись невозможна.** Проверка перед сохранением и уникальный индекс в базе данных на случай одновременных нажатий.
- **Защита от подделки кнопок.** Клиент не может отменить чужую запись, открыть админку или записаться на прошедшую дату.
- **Автотесты.** 27 сценариев прогоняются на каждой из 5 конфигураций при каждом коммите (GitHub Actions).

## ⚙️ Настройка за 2 минуты

Всё меняется в [`tgcloud/lib/config.js`](tgcloud/lib/config.js):

```js
export const BUSINESS = { name: 'Стоматология «Tabassum»', address: '…', phone: '…' };

export const SERVICES = [
  { id: 'consult', title: 'Первичная консультация', price: 0 },      // → «бесплатно»
  { id: 'clean',   title: 'Профессиональная чистка', price: 300000 }, // → «300 000 сум»
  { id: 'treat',   title: 'Лечение кариеса',         price: null },   // цена не показывается
];

export const SCHEDULE = { open: '09:00', close: '18:00', slotMinutes: 30, daysOff: [0] };
```

Затем выполни `npx tgcloud push`, и бот обновлён.

## 🚀 Запуск

Подробная инструкция с нуля: **[ЗАПУСК.md](ЗАПУСК.md)**.

```bash
npm install
npx tgcloud login      # токен: @BotFather → бот → Serverless → CLI Access
npx tgcloud push       # загрузить код
npx tgcloud migrate    # создать таблицы
```

## 🏗 Архитектура

```mermaid
flowchart LR
    U[👤 Клиент] -->|сообщение / кнопка| T[Telegram]
    T -->|webhook| H{handlers/}
    H --> M[message.js<br/>команды, телефон]
    H --> C[callback_query.js<br/>кнопки]
    M & C --> L[lib/bookings.js<br/>слоты и записи]
    M & C --> UI[lib/ui.js<br/>тексты и клавиатуры]
    L --> DB[(SQLite)]
    UI --> CFG[lib/config.js<br/>настройки бизнеса]
    C -->|уведомления| A[🛠 Админ]
```

```
tgcloud/
├─ schema.js                 # таблицы: bookings, drafts
├─ handlers/
│  ├─ message.js             # команды, телефон клиента
│  └─ callback_query.js      # нажатия на кнопки
└─ lib/
   ├─ config.js              # ⚙️ настройки бизнеса
   ├─ bookings.js            # слоты, записи, черновики
   ├─ ui.js                  # тексты и клавиатуры
   └─ time.js                # даты в часовом поясе бизнеса
examples/                    # готовые настройки для разных видов бизнеса
test/                        # локальные тесты с эмуляцией платформы
```

## 🧪 Тесты

У платформы нет локального эмулятора, поэтому в `test/` есть свой: вместо `sdk` подставляется настоящая SQLite (через Drizzle ORM) и поддельный Bot API, который записывает все вызовы.

```bash
npm test
```

```
━━━ examples/clinic.js ━━━
Конфигурация: Стоматология «Tabassum» · услуг: 3 · слотов в день: 18
✅ Контакт → запись создана, клиенту подтверждение, админу уведомление
✅ Гонка: время заняли, пока клиент отправлял номер
✅ Чужую запись отменить нельзя
…
🎉 Все 5 конфигурации прошли проверку
```

## 🤖 Команды

| Команда | Что делает |
|---|---|
| `/start` | Главное меню |
| `/myid` | Показать свой Telegram ID (для настройки админов) |
| `/admin` | Админка (только для `ADMIN_IDS`) |

## 🗺 Планы

- [ ] Несколько мастеров или специалистов с отдельным расписанием
- [ ] Услуги разной длительности
- [ ] Автонапоминания за 2 часа (когда платформа добавит запуск по расписанию)
- [ ] Предоплата через Telegram Payments
- [ ] Интерфейс на узбекском языке
- [ ] Mini App с календарём

## 📄 Лицензия

[MIT](LICENSE)
