// Пример: автомойка / автосервис
// Скопируйте этот файл в tgcloud/lib/config.js и выполните `npx tgcloud push`.

export const BUSINESS = {
  name: 'Автомойка «Toza»',
  address: 'Ташкент, Чиланзар, ул. Бунёдкор, 7',
  phone: '+998 93 555 55 55',
  mapUrl: '',
};

export const TEXTS = {
  icon: '🚗',
  welcome: 'Запишитесь на мойку без очереди.',
  chooseService: 'Выберите тип мойки:',
  contactReason: 'чтобы мы предупредили вас, если освободимся раньше',
  booked: 'Ждём вас и вашу машину!',
};

// Отправьте боту /myid и впишите сюда свой ID.
export const ADMIN_IDS = [
  // 123456789,
];

export const SERVICES = [
  { id: 'express', title: 'Экспресс-мойка кузова', price: 40000 },
  { id: 'full',    title: 'Комплекс: кузов + салон', price: 90000 },
  { id: 'polish',  title: 'Полировка',              price: 400000 },
];

export const SCHEDULE = {
  open: '08:00', close: '22:00', slotMinutes: 30,
  daysOff: [], daysAhead: 3, minNoticeMinutes: 15, utcOffsetHours: 5,
};

export const CURRENCY = 'сум';
