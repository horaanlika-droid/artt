/** Глобальное состояние витрины: каталог, корзина, избранное, черновик заказа. */
import { api } from './api.js';
import { locale } from './i18n.js';

const LS_CART = 'ce.cart.v1';
const LS_DRAFT = 'ce.checkout.v1';

const listeners = new Set();

export const state = {
  ready: false,
  config: null,
  categories: [],
  products: [],
  productsById: new Map(),
  favorites: new Set(),
  cart: new Map(), // id -> qty
  orders: [],
  supportUnread: 0,
  draft: {
    customer: { name: '', phone: '', email: '' },
    delivery: { method: 'emirates', city: '', address: '' },
    company: { name: '', trn: '', vat: '', address: '', email: '' },
    comment: '',
    payment: null,
  },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(event = 'change') {
  for (const fn of listeners) {
    try { fn(event, state); } catch (err) { console.error(err); }
  }
}

// ── загрузка: локальный каталог сразу, API-синхронизация в фоне ──
let localSnapshot = null;
let localDictionaries = {};

function loadLocal() {
  try {
    const cart = JSON.parse(localStorage.getItem(LS_CART) || '[]');
    for (const it of cart) state.cart.set(String(it.id), Number(it.qty) || 1);
  } catch {}
  try {
    const draft = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null');
    if (draft) Object.assign(state.draft, draft);
  } catch {}
}

function persistLocal() {
  try {
    localStorage.setItem(LS_CART, JSON.stringify(cartItems()));
    localStorage.setItem(LS_DRAFT, JSON.stringify(state.draft));
  } catch {}
}

function localized(value, lang) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return String(value[lang] ?? value.en ?? value.ru ?? '');
  return String(value);
}

function imageUrl(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^(?:https?:|data:|blob:|\/\/)/i.test(value)) return value;
  const clean = value.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^(?:\.\/|\.\.\/)+/, '');
  const localPath = clean.startsWith('assets/')
    ? clean
    : clean.startsWith('products/') ? `assets/${clean}` : `assets/products/${clean}`;
  return `/${localPath}`;
}

function normalizeCatalog(catalog, lang) {
  const categories = (catalog?.categories || []).map((item) => ({
    ...item,
    title: localized(item.title, lang),
    subtitle: localized(item.subtitle, lang),
  }));
  const categoryById = new Map(categories.map((item) => [item.id, item]));
  const products = (catalog?.products || [])
    .filter((item) => !item.hidden)
    .map((item) => ({
      ...item,
      id: String(item.id),
      name: localized(item.name, lang),
      nameEn: localized(item.nameEn ?? item.name, 'en'),
      description: localized(item.description, lang),
      collectionLabel: localized(item.collectionLabel, lang) || categoryById.get(item.category)?.title || '',
      volumeLabel: localized(item.volumeLabel, lang),
      glassLabel: localized(item.glassLabel, lang),
      material: localized(item.material, lang),
      price: item.price === null || item.price === undefined || item.price === ''
        ? null
        : (Number.isFinite(Number(item.price)) ? Number(item.price) : null),
      priceUsd: item.priceUsd === null || item.priceUsd === undefined || item.priceUsd === ''
        ? null
        : (Number.isFinite(Number(item.priceUsd)) ? Number(item.priceUsd) : null),
      image: imageUrl(item.image),
      specs: (item.specs || []).map((spec) => ({
        ...spec,
        key: localized(spec.key, lang),
        value: localized(spec.value, lang),
      })),
      isNew: Boolean(item.isNew),
      isHit: Boolean(item.isHit),
      outOfStock: Boolean(item.outOfStock),
      comingSoon: Boolean(item.comingSoon),
    }));
  return { categories, products };
}

function installCatalog(catalog, lang, keepExisting = true) {
  const normalized = normalizeCatalog(catalog, lang);
  if (!normalized.products.length && keepExisting && state.products.length) return false;
  state.categories = normalized.categories;
  state.products = normalized.products;
  state.productsById = new Map(normalized.products.map((item) => [item.id, item]));
  return normalized.products.length > 0;
}

function fallbackConfig(snapshot, lang) {
  const sourceBrand = snapshot?.brand || {};
  const sourceDelivery = snapshot?.delivery || {};
  const dictionary = localDictionaries[lang] || {};
  const brand = {
    ...sourceBrand,
    tagline: localized(sourceBrand.tagline, lang),
    about: localized(sourceBrand.about, lang),
  };
  const rawFreeFrom = Number(sourceDelivery.freeFromAed);
  const rawCost = Number(sourceDelivery.costAed);
  const freeFrom = Number.isFinite(rawFreeFrom) ? rawFreeFrom : 1000;
  const cost = Number.isFinite(rawCost) ? rawCost : 50;
  const deliveryNames = lang === 'en'
    ? ['Courier in Dubai', 'Courier across the Emirates', 'Export (DHL / FedEx)', 'Pickup from our Al Quoz warehouse']
    : ['Курьер по Дубаю', 'Курьер по эмиратам', 'Экспорт (DHL / FedEx)', 'Самовывоз со склада, Al Quoz'];
  const payments = lang === 'en'
    ? [
      { id: 'invoice', title: 'Company invoice', subtitle: 'Bank transfer, VAT invoice, full paperwork', hint: '', enabled: true },
      { id: 'card', title: 'Card online', subtitle: 'Visa, Mastercard, Apple Pay — payment link from our team', hint: 'Our team will send a payment link', enabled: true, manual: true },
    ]
    : [
      { id: 'invoice', title: 'Инвойс на компанию', subtitle: 'Банковский перевод, VAT-инвойс, закрывающие документы', hint: '', enabled: true },
      { id: 'card', title: 'Картой онлайн', subtitle: 'Visa, Mastercard, Apple Pay — платёжная ссылка от менеджера', hint: 'Менеджер пришлёт ссылку на оплату', enabled: true, manual: true },
    ];
  const statusTitles = lang === 'en'
    ? { new: 'New', awaiting_payment: 'Awaiting payment', paid: 'Paid', packing: 'Packing', shipped: 'Shipped', done: 'Delivered', canceled: 'Canceled' }
    : { new: 'Новый', awaiting_payment: 'Ждёт оплаты', paid: 'Оплачен', packing: 'Собирается', shipped: 'Отправлен', done: 'Доставлен', canceled: 'Отменён' };

  return {
    locale: lang,
    i18n: dictionary,
    brand,
    delivery: {
      note: localized(sourceDelivery.note, lang),
      freeCities: sourceDelivery.freeCities || [],
      methods: [
        { id: 'dubai', title: deliveryNames[0], free: true, quote: false, cost: 0 },
        { id: 'emirates', title: deliveryNames[1], free: false, quote: false, cost },
        { id: 'export', title: deliveryNames[2], free: false, quote: true, cost: 0 },
        { id: 'pickup', title: deliveryNames[3], free: true, quote: false, cost: 0 },
      ],
      freeFrom,
      cost,
    },
    currencies: { base: brand.currency || 'AED', reference: 'USD', usdRate: Number(brand.usdRate) || 3.6725 },
    payments,
    statuses: Object.fromEntries(Object.entries(statusTitles).map(([id, title]) => [id, {
      title,
      emoji: ({ new: '🆕', awaiting_payment: '⏳', paid: '✅', packing: '📦', shipped: '🚚', done: '🎉', canceled: '❌' })[id],
    }])),
    user: {},
    guest: true,
    supportEnabled: false,
  };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return response.json();
}

async function syncFromServer() {
  const requestedLocale = locale.current;
  const [configResult, catalogResult] = await Promise.allSettled([api.config(), api.catalog()]);
  let changed = false;

  if (locale.current === requestedLocale && configResult.status === 'fulfilled') {
    state.config = configResult.value;
    locale.set(configResult.value.locale || requestedLocale);
    locale.load(configResult.value.i18n || localDictionaries[locale.current] || {});
    changed = true;
  }
  if (locale.current === requestedLocale && catalogResult.status === 'fulfilled') {
    changed = installCatalog(catalogResult.value, requestedLocale) || changed;
  }

  const [favoritesResult, cartResult] = await Promise.allSettled([api.favorites(), api.cart()]);
  if (favoritesResult.status === 'fulfilled') {
    state.favorites = new Set(favoritesResult.value.ids || []);
    changed = true;
  }
  if (cartResult.status === 'fulfilled' && !state.cart.size && cartResult.value.items?.length) {
    for (const item of cartResult.value.items) state.cart.set(String(item.id), Number(item.qty) || 1);
    changed = true;
  }

  for (const id of [...state.cart.keys()]) {
    const item = state.productsById.get(id);
    if (!item || item.outOfStock) state.cart.delete(id);
  }
  persistLocal();
  if (changed) notify('remote-ready');
}

export async function bootstrap() {
  loadLocal();
  const [catalogResult, dictionariesResult] = await Promise.allSettled([
    fetchJson('/assets/catalog.json'),
    fetchJson('/assets/i18n-fallback.json'),
  ]);

  localSnapshot = catalogResult.status === 'fulfilled' ? catalogResult.value : null;
  localDictionaries = dictionariesResult.status === 'fulfilled' ? dictionariesResult.value : {};
  const lang = locale.current;
  locale.load(localDictionaries[lang] || {});

  if (localSnapshot) {
    state.config = fallbackConfig(localSnapshot, lang);
    installCatalog(localSnapshot, lang, false);
  } else {
    // Last-resort path for a host that omits the bundled snapshot.
    const catalog = await api.catalog();
    installCatalog(catalog, lang, false);
    try {
      state.config = await api.config();
      locale.load(state.config.i18n || {});
    } catch {}
  }

  state.ready = true;
  persistLocal();
  notify('ready');

  // Rendering never waits for the backend; saved catalog + photos are already local.
  syncFromServer().catch((err) => console.warn('[state] online sync skipped:', err.message));
  return state;
}

/** Смена языка: переключаем локальный каталог сразу, затем сверяем его с API. */
export async function switchLocale(lang) {
  if (lang !== 'ru' && lang !== 'en') return;
  locale.set(lang);
  if (localSnapshot) {
    state.config = fallbackConfig(localSnapshot, lang);
    locale.load(localDictionaries[lang] || {});
    installCatalog(localSnapshot, lang, false);
  }

  try {
    const [configResult, catalogResult] = await Promise.allSettled([api.config(), api.catalog()]);
    if (locale.current === lang && configResult.status === 'fulfilled') {
      state.config = configResult.value;
      locale.load(configResult.value.i18n || localDictionaries[lang] || {});
    }
    if (locale.current === lang && catalogResult.status === 'fulfilled') {
      installCatalog(catalogResult.value, lang);
    }
  } catch {}
  notify('locale');
}

// ── каталог ───────────────────────────────────────────────────
export const product = (id) => state.productsById.get(String(id)) || null;

export function categoryProducts(categoryId) {
  return state.products.filter((p) => p.category === categoryId);
}

export function categoryCount(categoryId) {
  return categoryProducts(categoryId).length;
}

export function searchProducts(query) {
  const q = query.trim().toLowerCase();
  if (!q) return state.products;
  return state.products.filter((p) =>
    `${p.name} ${p.nameEn || ''} ${p.article} ${p.volumeLabel} ${p.collectionLabel || ''}`
      .toLowerCase().includes(q));
}

// ── корзина ───────────────────────────────────────────────────
export function cartItems() {
  return [...state.cart.entries()].map(([id, qty]) => ({ id, qty }));
}

export function cartDetailed() {
  return cartItems()
    .map(({ id, qty }) => {
      const p = product(id);
      return p ? { ...p, qty, sum: (p.price || 0) * qty } : null;
    })
    .filter(Boolean);
}

export const cartCount = () => [...state.cart.values()].reduce((s, q) => s + q, 0);
export const cartSubtotal = () => cartDetailed().reduce((s, it) => s + it.sum, 0);
export const cartHasRequestOnly = () => cartDetailed().some((it) => !it.price);

function syncCart() {
  persistLocal();
  api.saveCart(cartItems()).catch(() => {});
  notify('cart');
}

export function addToCart(id, qty = 1) {
  const key = String(id);
  state.cart.set(key, Math.min(999, (state.cart.get(key) || 0) + qty));
  syncCart();
}

export function setQty(id, qty) {
  const key = String(id);
  if (qty <= 0) state.cart.delete(key);
  else state.cart.set(key, Math.min(999, qty));
  syncCart();
}

export function removeFromCart(id) {
  state.cart.delete(String(id));
  syncCart();
}

export function clearCart() {
  state.cart.clear();
  syncCart();
}

export const inCart = (id) => state.cart.get(String(id)) || 0;

// ── избранное ─────────────────────────────────────────────────
export const isFavorite = (id) => state.favorites.has(String(id));

export function toggleFavorite(id) {
  const key = String(id);
  if (state.favorites.has(key)) state.favorites.delete(key);
  else state.favorites.add(key);
  notify('favorites');
  api.toggleFavorite(key)
    .then((res) => { state.favorites = new Set(res.ids || []); notify('favorites'); })
    .catch(() => {});
  return state.favorites.has(key);
}

export const favoriteProducts = () => state.products.filter((p) => state.favorites.has(p.id));

// ── доставка и черновик ───────────────────────────────────────
export function shippingFor(subtotal, method) {
  const cfg = state.config?.delivery;
  if (!cfg) return 0;
  const m = (cfg.methods || []).find((x) => x.id === method);
  if (!m || m.free || m.quote) return 0;
  return subtotal >= cfg.freeFrom ? 0 : cfg.cost;
}

export function saveDraft(patch) {
  Object.assign(state.draft, patch);
  persistLocal();
}

export function updateOrdersCache(orders) {
  state.orders = orders;
  notify('orders');
}
