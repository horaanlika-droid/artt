/**
 * Конфигурация приложения Cocktail Embassy.
 * Всё, что относится к интеграциям, берётся из переменных окружения —
 * ни токенов, ни ключей, ни ID администраторов в коде нет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Простейший .env-лоадер (без зависимостей).
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const str = (key, def = '') => (process.env[key] ?? def).toString().trim();
const num = (key, def) => {
  const value = Number.parseFloat(str(key));
  return Number.isFinite(value) ? value : def;
};
const bool = (key, def = false) => {
  const value = str(key).toLowerCase();
  if (!value) return def;
  return ['1', 'true', 'yes', 'on'].includes(value);
};

const botToken = str('BOT_TOKEN');
const adminIds = str('ADMIN_IDS')
  .split(/[,;\s]+/)
  .map((x) => x.trim())
  .filter(Boolean)
  .map(Number)
  .filter((x) => Number.isFinite(x) && x > 0);

function detectPublicUrl() {
  let url = str('PUBLIC_URL');
  if (!url) {
    url = str('DOMAIN') || str('BOTHOST_DOMAIN') || str('BOT_DOMAIN');
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

export const config = {
  root: ROOT,
  brandName: str('BRAND_NAME', 'Cocktail Embassy'),
  mode: (str('MODE', 'all') || 'all').toLowerCase(), // all | web | bot
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  webPorts: (() => {
    const main = num('PORT', 3000);
    const extra = str('EXTRA_PORTS', '3000,8080')
      .split(/[,;\s]+/)
      .map((x) => Number.parseInt(x, 10))
      .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
    return [...new Set([main, ...extra])];
  })(),
  publicUrl: detectPublicUrl(),

  /** Язык по умолчанию: ru — русскоязычные HoReCa-клиенты, en — остальные. */
  defaultLocale: (str('DEFAULT_LOCALE', 'ru') || 'ru').slice(0, 2),

  telegram: {
    token: botToken,
    hasBot: Boolean(botToken),
    username: str('BOT_USERNAME').replace(/^@/, ''),
    adminIds,
    mode: str('TELEGRAM_MODE', 'polling').toLowerCase(),
    webhookSecret: str('TELEGRAM_WEBHOOK_SECRET'),
  },

  /**
   * Онлайн-оплата картой. Если ключи ЮKassa не заданы, заказ всё равно
   * оформляется: менеджер присылает ссылку на оплату вручную (так обычно
   * и работает экспорт из ОАЭ), а админ отмечает оплату в боте.
   */
  payments: {
    link: str('PAYMENT_LINK'),        // постоянная платёжная ссылка (Stripe/PayBy/Telr)
    note: str('PAYMENT_NOTE'),        // текст для клиента на экране оплаты
    yookassa: {
      shopId: str('YOOKASSA_SHOP_ID'),
      secretKey: str('YOOKASSA_SECRET_KEY'),
      vatCode: num('YOOKASSA_VAT_CODE', 1),
      receipt: bool('YOOKASSA_RECEIPT', false),
      get enabled() {
        return Boolean(this.shopId && this.secretKey);
      },
    },
  },

  /** Реквизиты продавца для коммерческого инвойса (ОАЭ). */
  seller: {
    name: str('SELLER_NAME', 'Cocktail Embassy'),
    legalName: str('SELLER_LEGAL_NAME', 'Cocktail Embassy FZ-LLC'),
    trn: str('SELLER_TRN'),
    licence: str('SELLER_LICENCE'),
    address: str('SELLER_ADDRESS', 'Al Quoz Industrial Area 3, Dubai, UAE'),
    bankName: str('SELLER_BANK_NAME'),
    iban: str('SELLER_IBAN'),
    swift: str('SELLER_SWIFT'),
    accountName: str('SELLER_ACCOUNT_NAME', 'Cocktail Embassy FZ-LLC'),
    accountNumber: str('SELLER_ACCOUNT_NUMBER'),
    phone: str('SELLER_PHONE', '+971 56 238 8262'),
    email: str('SELLER_EMAIL', 'sales@cocktailembassy.ae'),
    invoicePrefix: str('INVOICE_PREFIX', 'CE-'),
    vatRate: num('VAT_RATE', 5),
    vatIncluded: bool('VAT_INCLUDED', true),
    get configured() {
      return Boolean(this.iban || this.accountNumber);
    },
  },

  shop: {
    currency: str('CURRENCY', 'AED'),
    /** Курс для справочной цены в USD: 1 USD = usdRate AED. */
    usdRate: num('USD_RATE', 3.6725),
    freeShippingFrom: num('FREE_SHIPPING_FROM', 1000),
    shippingCost: num('SHIPPING_COST', 50),
    minOrderTotal: num('MIN_ORDER_TOTAL', 0),
    wholesaleFrom: num('WHOLESALE_FROM', 24),
  },
};

/** Список способов оплаты для витрины. */
export function paymentMethods(locale = 'ru') {
  const manual = !config.payments.yookassa.enabled;
  return [
    {
      id: 'invoice',
      title: locale === 'en' ? 'Company invoice' : 'Инвойс на компанию',
      subtitle: locale === 'en'
        ? 'Bank transfer, VAT invoice, full paperwork'
        : 'Банковский перевод, VAT-инвойс, закрывающие документы',
      hint: '',
      enabled: true,
    },
    {
      id: 'card',
      title: locale === 'en' ? 'Card online' : 'Картой онлайн',
      subtitle: locale === 'en'
        ? 'Visa, Mastercard, Apple Pay — payment link from our team'
        : 'Visa, Mastercard, Apple Pay — платёжная ссылка от менеджера',
      hint: config.payments.note
        || (locale === 'en' ? 'Our team will send a payment link' : 'Менеджер пришлёт ссылку на оплату'),
      enabled: true,
      manual,
    },
  ];
}

export function isAdmin(userId) {
  return config.telegram.adminIds.includes(Number(userId));
}
