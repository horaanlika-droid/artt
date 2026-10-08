/**
 * Двуязычность: русский и английский.
 *
 * Одна витрина обслуживает оба языка. Язык выбирается так (по приоритету):
 *   1) ?lang=ru|en в адресе,
 *   2) cookie ce_lang,
 *   3) язык интерфейса Telegram (для Mini App),
 *   4) Accept-Language браузера,
 *   5) русский по умолчанию.
 *
 * Базовые данные (data/catalog.json) хранят тексты сразу в двух языках:
 *   { "ru": "Коктейльный бокал", "en": "Cocktail glass" }
 * Функция tv() достаёт нужный язык, не ломаясь на обычной строке.
 */

export const LOCALES = ['ru', 'en'];
export const DEFAULT_LOCALE = 'ru';

export function isLocale(value) {
  return LOCALES.includes(String(value || '').toLowerCase().slice(0, 2));
}

export function normalizeLocale(value) {
  const short = String(value || '').toLowerCase().slice(0, 2);
  return isLocale(short) ? short : '';
}

/** Достаёт текст нужного языка из пары { ru, en } (или возвращает строку как есть). */
export function tv(value, locale = DEFAULT_LOCALE) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return String(value[loc] ?? value[DEFAULT_LOCALE] ?? Object.values(value)[0] ?? '');
}

/** Определяет язык запроса. */
export function localeFromRequest(req) {
  const query = normalizeLocale(req.query?.lang);
  if (query) return query;

  for (const part of String(req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() !== 'lang') continue;
    const value = normalizeLocale(part.slice(i + 1).trim());
    if (value) return value;
  }

  const header = String(req.headers?.['accept-language'] || '');
  for (const chunk of header.split(',')) {
    const value = normalizeLocale(chunk.split(';')[0].trim());
    if (value) return value;
  }
  return DEFAULT_LOCALE;
}

// ─── словарь интерфейса ────────────────────────────────────────
// Ключи сгруппированы по экранам. Формат: ключ -> { ru, en }.
const DICT = {
  // общие
  'app.tagline': { ru: 'Хрустальное стекло ручной выдувки для баров и ресторанов', en: 'Hand-blown crystal glassware for bars & restaurants' },
  'common.back': { ru: 'Назад', en: 'Back' },
  'common.more': { ru: 'Все', en: 'All' },
  'common.all': { ru: 'Все', en: 'All' },
  'common.retry': { ru: 'Повторить', en: 'Retry' },
  'common.loading': { ru: 'Загружаем каталог…', en: 'Loading the catalogue…' },
  'common.loadingShort': { ru: 'Загрузка…', en: 'Loading…' },
  'common.save': { ru: 'Сохранить', en: 'Save' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.send': { ru: 'Отправить', en: 'Send' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.article': { ru: 'арт.', en: 'art.' },
  'common.pieces': { ru: 'поз.', en: 'items' },
  'common.pcs': { ru: 'шт', en: 'pc' },
  'common.piece': { ru: 'за штуку', en: 'per piece' },
  'common.error': { ru: 'Что-то пошло не так', en: 'Something went wrong' },
  'common.approx': { ru: '≈', en: '≈' },

  // таб-бар и навигация
  'tab.home': { ru: 'Главная', en: 'Home' },
  'tab.catalog': { ru: 'Каталог', en: 'Catalogue' },
  'tab.favorites': { ru: 'Избранное', en: 'Saved' },
  'tab.cart': { ru: 'Корзина', en: 'Cart' },
  'tab.profile': { ru: 'Кабинет', en: 'Account' },

  // главная
  'home.search': { ru: 'Поиск по каталогу', en: 'Search the catalogue' },
  'home.slide1.title': { ru: 'Тонкий хрусталь\nдля вашего бара', en: 'Thin crystal\nfor your bar' },
  'home.slide1.sub': { ru: 'Ручная выдувка, край меньше миллиметра — стекло, которое чувствует бармен', en: 'Hand-blown, sub-millimetre rim — glass a bartender can feel' },
  'home.slide2.title': { ru: 'Дубай,\nдоставка по миру', en: 'Dubai,\nshipping worldwide' },
  'home.slide2.sub': { ru: 'Склад в Al Quoz, отгрузка за 1–2 дня, экспорт DHL и FedEx', en: 'Warehouse in Al Quoz, dispatch in 1–2 days, DHL and FedEx export' },
  'home.slide3.title': { ru: 'Коллекции,\nотобранные вживую', en: 'Collections\nchosen in person' },
  'home.slide3.sub': { ru: 'Японский хрусталь и ручная выдувка: 9 коллекций для HoReCa', en: 'Japanese crystal and hand-blowing: 9 collections for HoReCa' },
  'home.cta': { ru: 'Перейти в каталог', en: 'Browse the catalogue' },
  'home.feature1': { ru: 'Отгрузка\nза 1–2 дня', en: 'Dispatch\nin 1–2 days' },
  'home.feature2': { ru: 'Тонкое\nстекло', en: 'Thin\ncrystal' },
  'home.feature3': { ru: 'Отбор\nвручную', en: 'Selected\nby hand' },
  'home.feature4': { ru: 'Оплата картой\nи по счёту', en: 'Card or\ninvoice' },
  'home.categories': { ru: 'Коллекции', en: 'Collections' },
  'home.popular': { ru: 'Популярное', en: 'Most requested' },
  'home.new': { ru: 'Новинки', en: 'New arrivals' },
  'home.allProducts': { ru: 'Все товары', en: 'All pieces' },
  'home.watch': { ru: 'Смотреть', en: 'View' },
  'home.about': { ru: 'О бренде', en: 'About the brand' },
  'home.delivery': { ru: 'Доставка', en: 'Shipping' },
  'home.positions': { ru: 'позиций в каталоге', en: 'pieces in the catalogue' },
  'nav.products': { ru: 'Каталог', en: 'Products' },
  'nav.collections': { ru: 'Коллекции', en: 'Collections' },
  'nav.about': { ru: 'О бренде', en: 'About' },
  'nav.contact': { ru: 'Контакты', en: 'Contact' },
  'nav.wholesale': { ru: 'Опт', en: 'Wholesale' },
  'tab.collection': { ru: 'Коллекция', en: 'Collection' },
  'home.kicker': { ru: 'Премиальное стекло для современных баров', en: 'Premium glassware for modern bars' },
  'home.headline': { ru: 'Коктейлям нужно лучшее стекло', en: 'Cocktails Deserve Better Glass' },
  'home.heroText': { ru: 'Хрусталь ручной выдувки для тех, кто ценит деталь, баланс и атмосферу.', en: 'Hand-blown crystal glassware for those who appreciate detail, balance and atmosphere.' },
  'home.explore': { ru: 'Смотреть коллекцию', en: 'Explore Collection' },
  'home.mobileHeroTitle': { ru: 'Стекло вне времени для современных баров', en: 'Timeless glassware for modern bars' },
  'home.railTitle': { ru: 'Коллекции стекла', en: 'Glassware collection' },
  'home.railAccessories': { ru: 'Аксессуары', en: 'Accessories' },
  'home.stripSub': { ru: 'Коллекция', en: 'Collection' },
  'home.collectionsTitle': { ru: 'Коллекции', en: 'Collections' },
  'cart.yours': { ru: 'Ваша корзина', en: 'Your Cart' },
  'cart.proceed': { ru: 'Перейти к оформлению', en: 'Proceed to Checkout' },
  'trust.quality': { ru: 'Премиальное качество', en: 'Premium quality' },
  'trust.qualitySub': { ru: 'Хрусталь без свинца', en: 'Lead free crystal glass' },
  'trust.delivery': { ru: 'Быстрая доставка', en: 'Fast delivery' },
  'trust.deliverySub': { ru: 'ОАЭ и весь мир', en: 'UAE & worldwide' },
  'trust.payment': { ru: 'Безопасная оплата', en: 'Secure payment' },
  'trust.paymentSub': { ru: 'Разные способы', en: 'Multiple methods' },
  'feat.blown': { ru: 'Ручная выдувка', en: 'Hand-blown' },
  'feat.blownSub': { ru: 'Каждое изделие выдувается вручную — уникальность и характер.', en: 'Each piece is crafted by hand, ensuring uniqueness and character.' },
  'feat.classics': { ru: 'Современная классика', en: 'Modern classics' },
  'feat.classicsSub': { ru: 'Вне времени для современных баров и домов.', en: 'Timeless design for contemporary bars and homes.' },
  'feat.more': { ru: 'Больше, чем стекло', en: 'More than glass' },
  'feat.moreSub': { ru: 'Это атмосфера.', en: "It's an atmosphere." },
  'spec.capacity': { ru: 'Объём', en: 'Capacity' },
  'spec.height': { ru: 'Высота', en: 'Height' },
  'spec.material': { ru: 'Материал', en: 'Material' },
  'product.handBlowing': { ru: 'Ручная выдувка', en: 'HAND BLOWING' },
  'home.studio': { ru: 'Шоурум', en: 'Showroom' },

  // каталог
  'catalog.title': { ru: 'Каталог', en: 'Catalogue' },
  'catalog.searchPlaceholder': { ru: 'Поиск по каталогу…', en: 'Search the catalogue…' },
  'catalog.filters': { ru: 'Фильтры', en: 'Filters' },
  'catalog.sort': { ru: 'Сортировка', en: 'Sort' },
  'catalog.sort.popular': { ru: 'Сначала популярные', en: 'Most popular' },
  'catalog.sort.cheap': { ru: 'Сначала дешёвые', en: 'Price: low to high' },
  'catalog.sort.expensive': { ru: 'Сначала дорогие', en: 'Price: high to low' },
  'catalog.sort.volume': { ru: 'По объёму', en: 'By capacity' },
  'catalog.sort.name': { ru: 'По названию', en: 'By name' },
  'catalog.onlyNew': { ru: 'Только новинки', en: 'New arrivals only' },
  'catalog.onlyAvailable': { ru: 'Только в наличии', en: 'In stock only' },
  'catalog.maxPrice': { ru: 'Максимальная цена', en: 'Maximum price' },
  'catalog.any': { ru: 'любая', en: 'any' },
  'catalog.upto': { ru: 'до', en: 'up to' },
  'catalog.reset': { ru: 'Сбросить фильтры', en: 'Reset filters' },
  'catalog.nothing': { ru: 'Ничего не нашлось', en: 'Nothing found' },
  'catalog.nothingHint': { ru: 'Попробуйте изменить запрос или сбросить фильтры', en: 'Try another query or reset the filters' },
  'catalog.found': { ru: 'Найдено', en: 'Found' },
  'catalog.noQuery': { ru: 'По запросу «{q}» нет позиций', en: 'No pieces match “{q}”' },
  'catalog.recent': { ru: 'Недавние запросы', en: 'Recent searches' },
  'catalog.collections': { ru: 'Коллекции', en: 'Collections' },

  // товар
  'product.inStock': { ru: 'В наличии', en: 'In stock' },
  'product.outOfStock': { ru: 'Нет в наличии', en: 'Out of stock' },
  'product.comingSoon': { ru: 'Скоро', en: 'Coming soon' },
  'product.new': { ru: 'Новинка', en: 'New' },
  'product.hit': { ru: 'Хит', en: 'Bestseller' },
  'product.engraving': { ru: 'С гравировкой', en: 'Engraved' },
  'product.add': { ru: 'В корзину', en: 'Add to cart' },
  'product.inCart': { ru: 'В корзине', en: 'In cart' },
  'product.specs': { ru: 'Характеристики', en: 'Specifications' },
  'product.about': { ru: 'Описание', en: 'Description' },
  'product.similar': { ru: 'Похожие позиции', en: 'Similar pieces' },
  'product.ask': { ru: 'Запросить цену', en: 'Request a price' },
  'product.askHint': { ru: 'Менеджер подтвердит цену и дату поставки', en: 'Our team will confirm price and delivery date' },
  'product.wholesale': { ru: 'Оптовые цены от 24 шт.', en: 'Wholesale pricing from 24 pc' },
  'product.lead': { ru: 'Отгрузка со склада в Дубае за 1–2 дня', en: 'Ships from our Dubai warehouse in 1–2 days' },

  // избранное / поиск
  'favorites.title': { ru: 'Избранное', en: 'Saved' },
  'favorites.empty': { ru: 'Пока пусто', en: 'Nothing saved yet' },
  'favorites.emptyHint': { ru: 'Нажимайте на сердечко в карточке товара — позиции появятся здесь', en: 'Tap the heart on any piece and it will show up here' },
  'favorites.mayLike': { ru: 'Может понравиться', en: 'You may like' },
  'favorites.count': { ru: '{n} позиций', en: '{n} pieces' },
  'search.title': { ru: 'Поиск', en: 'Search' },
  'search.placeholder': { ru: 'Название, артикул или объём', en: 'Name, article or capacity' },

  // корзина
  'cart.title': { ru: 'Корзина', en: 'Cart' },
  'cart.empty': { ru: 'Корзина пуста', en: 'Your cart is empty' },
  'cart.emptyHint': { ru: 'Добавьте бокалы из каталога — оформим заказ за пару минут', en: 'Add glassware from the catalogue — checkout takes a couple of minutes' },
  'cart.toCatalog': { ru: 'В каталог', en: 'Browse catalogue' },
  'cart.goods': { ru: 'Товары', en: 'Items' },
  'cart.shipping': { ru: 'Доставка', en: 'Delivery' },
  'cart.total': { ru: 'К оплате', en: 'Total' },
  'cart.free': { ru: 'бесплатно', en: 'free' },
  'cart.checkout': { ru: 'Оформить заказ', en: 'Checkout' },
  'cart.clear': { ru: 'Очистить корзину', en: 'Empty the cart' },
  'cart.clearConfirm': { ru: 'Все товары будут удалены', en: 'All items will be removed' },
  'cart.clearOk': { ru: 'Очистить', en: 'Empty' },
  'cart.freeFrom': { ru: 'До бесплатной доставки ещё {amount}', en: '{amount} away from free delivery' },
  'cart.freeReached': { ru: 'Доставка бесплатная', en: 'Free delivery unlocked' },
  'cart.qty': { ru: 'Количество', en: 'Quantity' },

  // оформление
  'checkout.title': { ru: 'Оформление', en: 'Checkout' },
  'checkout.contacts': { ru: 'Контакты', en: 'Contact details' },
  'checkout.name': { ru: 'Имя', en: 'Name' },
  'checkout.namePlaceholder': { ru: 'Как к вам обращаться', en: 'What should we call you' },
  'checkout.phone': { ru: 'Телефон', en: 'Phone' },
  'checkout.email': { ru: 'E-mail', en: 'E-mail' },
  'checkout.emailPlaceholder': { ru: 'для счёта и документов', en: 'for invoice and documents' },
  'checkout.delivery': { ru: 'Способ доставки', en: 'Delivery method' },
  'checkout.deliveryAddress': { ru: 'Куда доставить', en: 'Delivery address' },
  'checkout.city': { ru: 'Город', en: 'City' },
  'checkout.cityPlaceholder': { ru: 'Дубай', en: 'Dubai' },
  'checkout.address': { ru: 'Адрес', en: 'Address' },
  'checkout.addressPlaceholder': { ru: 'Улица, дом, офис / пункт выдачи', en: 'Street, building, office / pickup point' },
  'checkout.payment': { ru: 'Оплата', en: 'Payment' },
  'checkout.company': { ru: 'Реквизиты компании', en: 'Company details' },
  'checkout.companyName': { ru: 'Компания', en: 'Company' },
  'checkout.companyPlaceholder': { ru: 'ООО «Бар» / Bar LLC', en: 'Bar LLC' },
  'checkout.trn': { ru: 'TRN (VAT)', en: 'TRN (VAT)' },
  'checkout.trnPlaceholder': { ru: 'для инвойса с НДС', en: 'for a VAT invoice' },
  'checkout.vatNumber': { ru: 'Номер НДС / ИНН', en: 'VAT / tax number' },
  'checkout.legalAddress': { ru: 'Юридический адрес', en: 'Registered address' },
  'checkout.invoiceEmail': { ru: 'E-mail для инвойса', en: 'Invoice e-mail' },
  'checkout.invoiceNote': { ru: 'Коммерческий инвойс формируется сразу после оформления — его можно открыть в разделе «Заказы». Закрывающие документы отправим на почту.', en: 'The commercial invoice is generated right after checkout — open it in Orders. All paperwork follows by e-mail.' },
  'checkout.comment': { ru: 'Комментарий', en: 'Comment' },
  'checkout.commentPlaceholder': { ru: 'Комментарий к заказу', en: 'Anything we should know about this order' },
  'checkout.yourOrder': { ru: 'Ваш заказ', en: 'Your order' },
  'checkout.pay': { ru: 'Оплатить', en: 'Pay' },
  'checkout.placeInvoice': { ru: 'Выставить инвойс', en: 'Issue invoice' },
  'checkout.sending': { ru: 'Отправляем…', en: 'Sending…' },
  'checkout.consent': { ru: 'Нажимая кнопку, вы соглашаетесь с условиями продажи и обработкой персональных данных.', en: 'By continuing you agree to our terms of sale and to the processing of your personal data.' },
  'checkout.fillIn': { ru: 'Заполните: {fields}', en: 'Please fill in: {fields}' },
  'checkout.f.name': { ru: 'имя', en: 'name' },
  'checkout.f.phone': { ru: 'телефон', en: 'phone' },
  'checkout.f.email': { ru: 'e-mail для инвойса', en: 'invoice e-mail' },
  'checkout.f.company': { ru: 'название компании', en: 'company name' },
  'checkout.f.trn': { ru: 'TRN или номер НДС', en: 'TRN or tax number' },
  'checkout.f.city': { ru: 'город', en: 'city' },
  'checkout.failed': { ru: 'Не удалось оформить заказ', en: 'We could not place the order' },

  // заказы
  'orders.title': { ru: 'Мои заказы', en: 'My orders' },
  'orders.empty': { ru: 'Заказов пока нет', en: 'No orders yet' },
  'orders.emptyHint': { ru: 'Соберите первый заказ — отгрузим за 1–2 дня', en: 'Place your first order — we dispatch in 1–2 days' },
  'orders.loading': { ru: 'Загружаем заказы…', en: 'Loading orders…' },
  'orders.failed': { ru: 'Не удалось загрузить', en: 'Could not load' },
  'orders.invoice': { ru: 'По инвойсу', en: 'Invoice' },
  'orders.card': { ru: 'Картой онлайн', en: 'Card online' },
  'order.title': { ru: 'Заказ', en: 'Order' },
  'order.loading': { ru: 'Загружаем заказ…', en: 'Loading the order…' },
  'order.notFound': { ru: 'Заказ не найден', en: 'Order not found' },
  'order.createdAt': { ru: 'Создан {date} в {time}', en: 'Created {date} at {time}' },
  'order.status': { ru: 'Статус', en: 'Status' },
  'order.items': { ru: 'Состав', en: 'Items' },
  'order.payment': { ru: 'Оплата', en: 'Payment' },
  'order.shipping': { ru: 'Доставка', en: 'Delivery' },
  'order.total': { ru: 'Итого', en: 'Total' },
  'order.recipient': { ru: 'Получатель', en: 'Recipient' },
  'order.comment': { ru: 'Комментарий', en: 'Comment' },
  'order.invoiceNumber': { ru: 'Номер инвойса', en: 'Invoice number' },
  'order.openInvoice': { ru: 'Открыть инвойс', en: 'Open the invoice' },
  'order.checkPayment': { ru: 'Проверить оплату', en: 'Check the payment' },
  'order.paid': { ru: 'Оплата получена, спасибо!', en: 'Payment received, thank you!' },
  'order.notPaid': { ru: 'Оплата пока не поступила', en: 'No payment yet' },
  'order.paidShort': { ru: 'Оплачен', en: 'Paid' },
  'order.awaitingPayment': { ru: 'Ожидает оплаты', en: 'Awaiting payment' },
  'order.canceledPayment': { ru: 'Платёж отменён', en: 'Payment canceled' },
  'order.cancel': { ru: 'Отменить заказ', en: 'Cancel the order' },
  'order.cancelConfirm': { ru: 'Отменить заказ?', en: 'Cancel this order?' },
  'order.canceled': { ru: 'Заказ отменён', en: 'Order canceled' },
  'order.cancelPaid': { ru: 'Оплаченный заказ отменяет менеджер — напишите в поддержку', en: 'A paid order is canceled by our team — please message support' },
  'order.support': { ru: 'Написать в поддержку', en: 'Message support' },
  'order.justCreatedInvoice': { ru: 'Заказ принят. Инвойс № {number} сформирован — откройте его кнопкой ниже и оплатите по реквизитам, после этого начнём сборку.', en: 'Order accepted. Invoice {number} is ready — open it below and pay by bank transfer; we start packing right after.' },
  'order.justCreated': { ru: 'Заказ принят. Мы уже видим его в системе.', en: 'Order accepted. It is already in our system.' },
  'order.awaitingNotice': { ru: 'Окно оплаты открыто в браузере. После оплаты вернитесь сюда и нажмите «Проверить оплату».', en: 'The payment window is open in your browser. Come back here after paying and tap “Check the payment”.' },
  'order.pay.requisites': { ru: 'Оплата по реквизитам инвойса', en: 'Bank transfer against the invoice' },
  'order.pay.card': { ru: 'Картой онлайн', en: 'Card online' },

  // статусы заказов
  'status.new': { ru: 'Новый', en: 'New' },
  'status.awaiting_payment': { ru: 'Ждёт оплаты', en: 'Awaiting payment' },
  'status.paid': { ru: 'Оплачен', en: 'Paid' },
  'status.packing': { ru: 'Собирается', en: 'Packing' },
  'status.shipped': { ru: 'Отправлен', en: 'Shipped' },
  'status.done': { ru: 'Доставлен', en: 'Delivered' },
  'status.canceled': { ru: 'Отменён', en: 'Canceled' },

  // кабинет
  'profile.title': { ru: 'Кабинет', en: 'Account' },
  'profile.guest': { ru: 'Гость', en: 'Guest' },
  'profile.guestHint': { ru: 'Войдите через Telegram, чтобы сохранить историю заказов на всех устройствах', en: 'Sign in with Telegram to keep your order history on every device' },
  'profile.stats.orders': { ru: 'Заказов', en: 'Orders' },
  'profile.stats.paid': { ru: 'Оплачено', en: 'Paid' },
  'profile.stats.saved': { ru: 'В избранном', en: 'Saved' },
  'profile.purchases': { ru: 'Покупки', en: 'Purchases' },
  'profile.myOrders': { ru: 'Мои заказы', en: 'My orders' },
  'profile.favorites': { ru: 'Избранное', en: 'Saved pieces' },
  'profile.support': { ru: 'Чат с менеджером', en: 'Chat with our team' },
  'profile.language': { ru: 'Язык', en: 'Language' },
  'profile.currency': { ru: 'Валюты', en: 'Currencies' },
  'profile.currencyValue': { ru: 'AED — расчёт, USD — справочно', en: 'AED for payment, USD as reference' },
  'profile.shop': { ru: 'Магазин', en: 'Shop' },
  'profile.deliveryAndPayment': { ru: 'Доставка и оплата', en: 'Delivery & payment' },
  'profile.about': { ru: 'О бренде', en: 'About the brand' },
  'profile.contacts': { ru: 'Контакты', en: 'Contacts' },
  'profile.manager': { ru: 'Менеджер', en: 'Sales manager' },
  'profile.instagram': { ru: 'Instagram', en: 'Instagram' },
  'profile.whatsapp': { ru: 'WhatsApp', en: 'WhatsApp' },
  'profile.email': { ru: 'Почта', en: 'E-mail' },
  'profile.phone': { ru: 'Телефон', en: 'Phone' },
  'profile.showroom': { ru: 'Шоурум и склад', en: 'Showroom & warehouse' },
  'profile.footer': { ru: 'Цены за штуку, AED. Отгрузка со склада в Дубае.', en: 'Prices per piece, AED. Shipped from our Dubai warehouse.' },
  'profile.bot': { ru: 'Открыть бота в Telegram', en: 'Open the Telegram bot' },
  'profile.privacy': { ru: 'Обработка данных', en: 'Privacy' },
  'profile.privacyText': { ru: 'Мы используем контакты только для связи по заказу и не передаём их третьим лицам.', en: 'We use your contact details only to handle this order and never share them with third parties.' },

  // поддержка
  'support.title': { ru: 'Поддержка', en: 'Support' },
  'support.placeholder': { ru: 'Сообщение…', en: 'Message…' },
  'support.hello': { ru: 'Здравствуйте! Это чат с менеджером Cocktail Embassy. Подберём стекло под концепцию бара, рассчитаем доставку и выставим инвойс. Обычно отвечаем в течение рабочего дня.', en: 'Hello! This is a chat with the Cocktail Embassy team. We will help you pick glassware for your concept, quote delivery and issue an invoice. We usually reply within one working day.' },
  'support.failed': { ru: 'Не удалось загрузить историю: {error}', en: 'Could not load the history: {error}' },
  'support.notSent': { ru: 'Сообщение не отправлено: {error}', en: 'Message not sent: {error}' },
  'support.orderContext': { ru: 'Вопрос по заказу {number}: ', en: 'Question about order {number}: ' },
  'support.q1': { ru: 'Нужен подбор бокалов под коктейльную карту', en: 'I need glassware matched to my cocktail menu' },
  'support.q2': { ru: 'Хочу инвойс на компанию', en: 'I need an invoice for my company' },
  'support.q3': { ru: 'Сроки доставки в мой город?', en: 'What are the delivery times to my city?' },
  'support.q4': { ru: 'Есть ли скидка на объём?', en: 'Do you offer volume discounts?' },
  'support.online': { ru: 'Менеджер на связи', en: 'Our team is online' },

  // доставка / оплата
  'delivery.title': { ru: 'Доставка и оплата', en: 'Delivery & payment' },
  'delivery.method.courier': { ru: 'Курьер по Дубаю', en: 'Courier in Dubai' },
  'delivery.method.emirates': { ru: 'Курьер по эмиратам', en: 'Courier across the Emirates' },
  'delivery.method.export': { ru: 'Экспорт (DHL / FedEx)', en: 'Export (DHL / FedEx)' },
  'delivery.method.pickup': { ru: 'Самовывоз со склада', en: 'Pickup from the warehouse' },
  'delivery.freeFrom': { ru: 'Бесплатно от {amount}, иначе {cost}', en: 'Free over {amount}, otherwise {cost}' },
  'delivery.exportNote': { ru: 'Рассчитываем индивидуально', en: 'Quoted individually' },
  'pay.invoice.title': { ru: 'Инвойс на компанию', en: 'Company invoice' },
  'pay.invoice.subtitle': { ru: 'Банковский перевод, VAT-инвойс, закрывающие документы', en: 'Bank transfer, VAT invoice, full paperwork' },
  'pay.card.title': { ru: 'Картой онлайн', en: 'Card online' },
  'pay.card.subtitle': { ru: 'Visa, Mastercard, Apple Pay — платёжная ссылка от менеджера', en: 'Visa, Mastercard, Apple Pay — payment link from our team' },
  'pay.card.hint': { ru: 'Менеджер пришлёт ссылку на оплату', en: 'Our team will send a payment link' },
  'pay.invoice.hint': { ru: 'Инвойс формируется сразу', en: 'Invoice is generated instantly' },

  // счёт / инвойс
  'invoice.title': { ru: 'Коммерческий инвойс', en: 'Commercial invoice' },
  'invoice.number': { ru: 'Инвойс №', en: 'Invoice no.' },
  'invoice.date': { ru: 'Дата', en: 'Date' },
  'invoice.seller': { ru: 'Продавец', en: 'Seller' },
  'invoice.buyer': { ru: 'Покупатель', en: 'Buyer' },
  'invoice.item': { ru: 'Наименование', en: 'Description' },
  'invoice.article': { ru: 'Артикул', en: 'Article' },
  'invoice.qty': { ru: 'Кол-во', en: 'Qty' },
  'invoice.price': { ru: 'Цена', en: 'Unit price' },
  'invoice.sum': { ru: 'Сумма', en: 'Amount' },
  'invoice.subtotal': { ru: 'Товары', en: 'Subtotal' },
  'invoice.shipping': { ru: 'Доставка', en: 'Delivery' },
  'invoice.total': { ru: 'Итого к оплате', en: 'Total due' },
  'invoice.inWords': { ru: 'Сумма прописью', en: 'Amount in words' },
  'invoice.vat': { ru: 'VAT 5% (ОАЭ)', en: 'VAT 5% (UAE)' },
  'invoice.vatIncluded': { ru: 'В том числе VAT 5%', en: 'VAT 5% included' },
  'invoice.vatNotIncluded': { ru: 'VAT не начисляется', en: 'VAT not applicable' },
  'invoice.bank': { ru: 'Банковские реквизиты', en: 'Bank details' },
  'invoice.bankName': { ru: 'Банк', en: 'Bank' },
  'invoice.iban': { ru: 'IBAN', en: 'IBAN' },
  'invoice.swift': { ru: 'SWIFT', en: 'SWIFT' },
  'invoice.accountName': { ru: 'Получатель', en: 'Account name' },
  'invoice.accountNumber': { ru: 'Расчётный счёт', en: 'Account number' },
  'invoice.trn': { ru: 'TRN', en: 'TRN' },
  'invoice.terms': { ru: 'Условия', en: 'Terms' },
  'invoice.termsText': { ru: 'Оплата в течение 5 рабочих дней. Товар отгружается после поступления средств. Доставка за счёт покупателя, если не указано иное.', en: 'Payment within 5 working days. Goods are dispatched after funds are received. Delivery at buyer’s cost unless agreed otherwise.' },
  'invoice.print': { ru: 'Печать / PDF', en: 'Print / PDF' },
  'invoice.signature': { ru: 'Подпись и печать', en: 'Signature & stamp' },
  'invoice.thanks': { ru: 'Спасибо за заказ!', en: 'Thank you for your order!' },

  // бот
  'bot.welcome': { ru: '{name}, приветствуем в Cocktail Embassy 🥂', en: '{name}, welcome to Cocktail Embassy 🥂' },
  'bot.welcomeBody': {
    ru: 'Барное стекло ручной выдувки из Дубая: тонкий хрусталь, 9 коллекций, отгрузка по ОАЭ и миру за 1–2 дня.',
    en: 'Hand-blown bar glassware from Dubai: thin crystal, 9 collections, dispatch across the UAE and worldwide in 1–2 days.',
  },
  'bot.openApp': { ru: 'Открыть магазин', en: 'Open the shop' },
  'bot.catalog': { ru: 'Каталог в чате', en: 'Catalogue in chat' },
  'bot.help': { ru: 'Помощь', en: 'Help' },
  'bot.support': { ru: 'Написать менеджеру', en: 'Message our team' },
  'bot.delivery': { ru: 'Доставка и оплата', en: 'Delivery & payment' },
  'bot.language': { ru: 'Язык / Language', en: 'Language / Язык' },
  'bot.menu': { ru: 'Меню', en: 'Menu' },
  'bot.unknown': { ru: 'Не понял команду. Откройте меню ниже 👇', en: 'I did not get that. Try the menu below 👇' },
  'bot.askQuestion': { ru: 'Напишите вопрос — менеджер ответит в этом чате.', en: 'Write your question — our team will reply right here.' },
  'bot.questionSent': { ru: 'Отправили менеджеру, ответим в ближайшее время.', en: 'Sent to our team, we will get back to you shortly.' },
  'bot.pickCollection': { ru: 'Коллекции', en: 'Collections' },
  'bot.backToCollections': { ru: '← Коллекции', en: '← Collections' },
  'bot.orderPlaced': { ru: 'Заказ {number} принят', en: 'Order {number} accepted' },
  'bot.orderStatus': { ru: 'Статус заказа {number}: {status}', en: 'Order {number} status: {status}' },
  'bot.supportReply': { ru: 'Ответ менеджера:', en: 'Reply from our team:' },
  'bot.openOrder': { ru: 'Открыть заказ', en: 'Open the order' },
  'bot.languageSet': { ru: 'Язык переключён на русский', en: 'Language switched to English' },
  'bot.pickLanguage': { ru: 'Выберите язык интерфейса', en: 'Choose your interface language' },

  // админка (в боте)
  'admin.title': { ru: 'Админ-панель Cocktail Embassy', en: 'Cocktail Embassy admin' },
  'admin.access': { ru: 'Доступ только для администраторов.', en: 'Admins only.' },
  'admin.orders': { ru: 'Заказы', en: 'Orders' },
  'admin.support': { ru: 'Поддержка', en: 'Support' },
  'admin.catalog': { ru: 'Каталог', en: 'Catalogue' },
  'admin.shop': { ru: 'Магазин и контакты', en: 'Shop & contacts' },
  'admin.stats': { ru: 'Статистика', en: 'Statistics' },
  'admin.broadcast': { ru: 'Рассылка', en: 'Broadcast' },
  'admin.settings': { ru: 'Настройки', en: 'Settings' },
  'admin.newOrders': { ru: 'Новые', en: 'New' },
};

/** Перевод по ключу с подстановкой {переменных}. */
export function t(key, locale = DEFAULT_LOCALE, vars = null) {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const entry = DICT[key];
  let text = entry ? (entry[loc] ?? entry[DEFAULT_LOCALE] ?? '') : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** Словарь целиком — отдаётся витрине одним запросом. */
export function dictionary(locale = DEFAULT_LOCALE) {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const out = {};
  for (const [key, entry] of Object.entries(DICT)) {
    out[key] = entry[loc] ?? entry[DEFAULT_LOCALE] ?? '';
  }
  return out;
}

/** Склонение/число: ru — три формы, en — две. */
export function plural(count, locale, forms) {
  const n = Math.abs(Number(count) || 0);
  if (isLocale(locale) && locale === 'en') return forms.en ?? (n === 1 ? forms.one : forms.other);
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms.ru0;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms.ru1;
  return forms.ru2;
}

export function positionsLabel(count, locale) {
  if (locale === 'en') return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
  return `${count} ${plural(count, 'ru', { ru0: 'позиция', ru1: 'позиции', ru2: 'позиций' })}`;
}
