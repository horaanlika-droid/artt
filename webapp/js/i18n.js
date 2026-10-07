/**
 * Язык витрины: перевод интерфейса и форматирование чисел.
 *
 * Словарь приходит с сервера (/api/config → i18n), поэтому правки текстов
 * не требуют пересборки фронтенда. До загрузки конфигурации язык определяется
 * по адресу и браузеру, чтобы сплэш сразу был на нужном языке.
 */
const LS_KEY = 'ce.lang';

function detect() {
  const url = new URLSearchParams(location.search).get('lang');
  if (url === 'ru' || url === 'en') return url;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {}
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || '';
  const nav = navigator.language || '';
  return String(tgLang || nav).toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export const locale = {
  current: detect(),
  dict: {},
  set(lang) {
    if (lang !== 'ru' && lang !== 'en') return;
    this.current = lang;
    try { localStorage.setItem(LS_KEY, lang); } catch {}
    document.documentElement.lang = lang;
  },
  load(dictionary) {
    this.dict = dictionary || {};
  },
};

/** Перевод по ключу с подстановкой {переменных}. */
export function t(key, vars) {
  let text = locale.dict[key];
  if (text === undefined) text = key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export const isRu = () => locale.current === 'ru';

/** Формат цены: AED — основная валюта, USD — справочная. */
const aed = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value) {
  if (value === null || value === undefined || value === '') return t('product.ask');
  return `AED ${aed.format(Math.round(value))}`;
}

export function moneyShort(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `AED ${aed.format(Math.round(value))}`;
}

/**
 * Справочная цена в USD. Приоритет — цена из прайса (priceUsd), иначе считаем
 * по курсу: 1 USD = rate AED, то есть AED / rate.
 */
export function usdHint(priceUsd, priceAed, rate) {
  const direct = Number(priceUsd);
  if (Number.isFinite(direct) && direct > 0) return `≈ $${usd.format(direct)}`;
  const aed = Number(priceAed);
  const r = Number(rate);
  if (Number.isFinite(aed) && aed > 0 && Number.isFinite(r) && r > 0) return `≈ $${usd.format(aed / r)}`;
  return '';
}

export { usd as usdNumber };
