// Пример: учебный центр / репетитор
// Скопируйте этот файл в tgcloud/lib/config.js и выполните `npx tgcloud push`.

export const BUSINESS = {
  name: 'IELTS Center «Bright»',
  address: 'Ташкент, Мирзо-Улугбек, ул. Буюк Ипак Йули, 100',
  phone: '+998 99 777 77 77',
  mapUrl: '',
};

export const TEXTS = {
  icon: '📚',
  welcome: 'Запишитесь на бесплатный пробный урок или тест уровня.',
  chooseService: 'Что вас интересует?',
  contactReason: 'чтобы менеджер подтвердил запись',
  booked: 'До встречи на занятии!',
};

// Отправьте боту /myid и впишите сюда свой ID.
export const ADMIN_IDS = [
  // 123456789,
];

export const SERVICES = [
  { id: 'level', title: 'Тест на уровень английского', price: 0 },
  { id: 'trial', title: 'Пробный урок IELTS',          price: 0 },
  { id: 'mock',  title: 'Mock IELTS (полный экзамен)', price: 150000 },
];

export const SCHEDULE = {
  open: '09:00', close: '20:00', slotMinutes: 60,
  daysOff: [0], daysAhead: 10, minNoticeMinutes: 120, utcOffsetHours: 5,
};

export const CURRENCY = 'сум';
