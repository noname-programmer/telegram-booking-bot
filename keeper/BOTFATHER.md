# Оформление бота в Telegram

Здесь записано всё, что видит человек в профиле бота: фото, описание, список команд.

## Что уже применено

Через Bot API (то есть без @BotFather) установлено:

- **фото профиля** — `assets/avatar.jpg`;
- **описание** — текст на пустом экране чата до нажатия «Начать»;
- **«о боте»** — короткая строка в профиле бота и в превью ссылки;
- **список команд** — меню «/» в чате; владельцу дополнительно видны `/stats`, `/vip`, `/unvip`;
- **кнопка «Keeper»** слева от поля ввода — открывает мини-приложение.

Тексты заданы на трёх языках: Telegram сам показывает тот, что совпадает с языком человека.
Исходник текстов — `assets/botinfo.json`.

## Что делается только руками в @BotFather

1. **Картинка над описанием.** `/mybots` → бот → **Edit Bot** → **Edit Description Picture** → отправить `assets/description.png`.
2. **Главное мини-приложение.** `/mybots` → бот → **Bot Settings** → **Configure Mini App** → **Enable Mini App** →
   адрес `https://app9031922868.tgcloud.ai/`. После этого в профиле бота появится кнопка «Открыть».
3. **Имя бота** (сейчас «Saver | Keeper») — **Edit Bot** → **Edit Name**, если захочется поменять.

## Тексты

### По умолчанию (английский)

**Описание**

```
Keeper shows you messages that the other person deleted or edited in your private chats.

• Deleted texts, photos, videos, voice messages and files — in original quality
• Edit history: what it said before and after
• Everything is sorted by person in a handy app, with no flood of notifications
• PIN code, a safe for files, insights

Set up in a minute: Telegram Settings → Telegram Business → Chatbots. Tap Start.
```

**О боте**

```
Shows deleted and edited messages from your private chats. Photos, videos and files in original quality.
```

**Команды**

```
start - Main menu and how to connect
pro - Pro: files, full history, 30 days of storage
promo - Enter a promo code: /promo CODE
lang - Language
privacy - My data and how to delete it
resetpin - Forgot the app PIN
```

### Русский

**Описание**

```
Keeper показывает сообщения, которые собеседник удалил или изменил в личном чате с вами.

• Удалённые тексты, фото, видео, голосовые и файлы — в исходном качестве
• История правок: что было и что стало
• Всё разложено по людям в удобном приложении, без потока уведомлений
• PIN-код, сейф для файлов, аналитика

Подключение за минуту: Настройки Telegram → Telegram для бизнеса → Чат-боты. Нажмите «Начать».
```

**О боте**

```
Показывает удалённые и изменённые сообщения из ваших личных чатов. Фото, видео и файлы — в исходном качестве.
```

**Команды**

```
start - Главное меню и как подключить
pro - Pro: файлы, полная история, хранение 30 дней
promo - Ввести промокод: /promo КОД
lang - Язык
privacy - Мои данные и как их удалить
resetpin - Забыли PIN-код приложения
```

### Узбекский

**Описание**

```
Keeper suhbatdoshingiz shaxsiy chatda o'chirgan yoki o'zgartirgan xabarlarni ko'rsatadi.

• O'chirilgan matn, rasm, video, ovozli xabar va fayllar — asl sifatida
• Tahrirlar tarixi: avval nima edi va nima bo'ldi
• Hammasi qulay ilovada odamlar bo'yicha tartiblangan, bildirishnomalar oqimisiz
• PIN-kod, fayllar uchun seyf, tahlil

Bir daqiqada ulanadi: Telegram sozlamalari → Telegram biznes uchun → Chat-botlar. «Boshlash» ni bosing.
```

**О боте**

```
Shaxsiy chatlaringizdagi o'chirilgan va o'zgartirilgan xabarlarni ko'rsatadi. Rasm, video va fayllar — asl sifatida.
```

**Команды**

```
start - Asosiy menyu va qanday ulash
pro - Pro: fayllar, to'liq tarix, 30 kun saqlash
promo - Promokod kiritish: /promo KOD
lang - Til
privacy - Ma'lumotlarim va ularni o'chirish
resetpin - Ilova PIN-kodini unutdingizmi
```
