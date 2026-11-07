// Пример: барбершоп / салон красоты
// Скопируйте этот файл в tgcloud/lib/config.js и выполните `npx tgcloud push`.

export const BUSINESS = {
  name: 'Barbershop «Ustara»',
  address: 'Ташкент, ул. Шота Руставели, 22',
  phone: '+998 90 123 45 67',
  mapUrl: '',
};

export const TEXTS = {
  icon: '✂️',
  welcome: 'Запишитесь к мастеру за 30 секунд — без звонков.',
  chooseService: 'Выберите услугу:',
  contactReason: 'чтобы мастер мог с вами связаться',
  booked: 'Ждём вас!',
};

// Отправьте боту /myid и впишите сюда свой ID.
export const ADMIN_IDS = [
  // 123456789,
];

export const SERVICES = [
  { id: 'cut',   title: 'Мужская стрижка',   price: 80000 },
  { id: 'beard', title: 'Оформление бороды', price: 50000 },
  { id: 'combo', title: 'Стрижка + борода',  price: 120000 },
  { id: 'kids',  title: 'Детская стрижка',   price: 60000 },
];

export const SCHEDULE = {
  open: '10:00', close: '21:00', slotMinutes: 60,
  daysOff: [], daysAhead: 7, minNoticeMinutes: 30, utcOffsetHours: 5,
};

export const CURRENCY = 'сум';
