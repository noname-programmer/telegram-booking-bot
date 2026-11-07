// Пример: стоматология / частная клиника
// Скопируйте этот файл в tgcloud/lib/config.js и выполните `npx tgcloud push`.

export const BUSINESS = {
  name: 'Стоматология «Tabassum»',
  address: 'Ташкент, Юнусабад, 4-квартал',
  phone: '+998 71 200 00 00',
  mapUrl: '',
};

export const TEXTS = {
  icon: '🦷',
  welcome: 'Запишитесь на приём онлайн. Мы перезвоним, если понадобится уточнить детали.',
  chooseService: 'Выберите вид приёма:',
  contactReason: 'чтобы регистратура могла подтвердить приём',
  booked: 'Пожалуйста, приходите за 10 минут до приёма.',
};

// Отправьте боту /myid и впишите сюда свой ID.
export const ADMIN_IDS = [
  // 123456789,
];

export const SERVICES = [
  { id: 'consult', title: 'Первичная консультация', price: 0 },
  { id: 'clean',   title: 'Профессиональная чистка', price: 300000 },
  { id: 'treat',   title: 'Лечение кариеса',         price: null },
];

export const SCHEDULE = {
  open: '09:00', close: '18:00', slotMinutes: 30,
  daysOff: [0], daysAhead: 14, minNoticeMinutes: 60, utcOffsetHours: 5,
};

export const CURRENCY = 'сум';
