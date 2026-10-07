/**
 * Каталог: базовые данные из data/catalog.json (собраны из прайса бренда),
 * поверх — правки администратора из БД (data/db.json):
 *   overrides        — изменение полей базовых товаров,
 *   customProducts   — товары, добавленные через админку,
 *   categories       — свои коллекции и переименование базовых,
 *   shopInfo         — бренд, контакты, доставка, тексты (в двух языках).
 *
 * Все тексты двуязычные: { ru: '…', en: '…' }. Витрина получает уже
 * переведённые строки (см. tv() в ./i18n.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { db, save } from './store.js';
import { tv, DEFAULT_LOCALE, isLocale } from './i18n.js';

const FILE = path.join(ROOT, 'data', 'catalog.json');
export const PRODUCTS_DIR = path.join(ROOT, 'webapp', 'assets', 'products');

let base = { brand: {}, categories: [], products: [], delivery: {} };
try {
  base = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`[catalog] загружено ${base.products?.length || 0} позиций из data/catalog.json`);
} catch (err) {
  console.error('[catalog] не удалось прочитать data/catalog.json:', err.message);
}

function apply(product) {
  const ov = db.overrides[product.id] || {};
  const merged = { ...product, ...ov };
  return {
    ...merged,
    price: Number.isFinite(merged.price) ? merged.price : product.price,
    basePrice: product.price,
    hidden: Boolean(merged.hidden),
    outOfStock: Boolean(merged.outOfStock) || Boolean(merged.comingSoon),
    isNew: Boolean(merged.isNew),
    isHit: Boolean(merged.isHit),
    custom: Boolean(db.customProducts[product.id]),
  };
}

function baseList() {
  const deleted = new Set(db.deletedProducts || []);
  return (base.products || []).filter((p) => !deleted.has(String(p.id)));
}

function customList() {
  return Object.values(db.customProducts || {});
}

export function allProducts() {
  return [...baseList().map(apply), ...customList().map(apply)];
}

export function publicProducts() {
  return allProducts().filter((p) => !p.hidden);
}

export function findProduct(id) {
  const key = String(id);
  const raw = baseList().find((x) => String(x.id) === key) || db.customProducts[key];
  return raw ? apply(raw) : null;
}

export function findProductRaw(id) {
  const key = String(id);
  return baseList().find((x) => String(x.id) === key) || db.customProducts[key] || null;
}

export function isCustomProduct(id) {
  return Boolean(db.customProducts[String(id)]);
}

export function isDeletedProduct(id) {
  return (db.deletedProducts || []).includes(String(id));
}

export function searchProducts(query, { includeHidden = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const list = includeHidden ? allProducts() : publicProducts();
  if (!q) return list;
  return list.filter((p) => {
    const hay = [
      tv(p.name, 'ru'), tv(p.name, 'en'),
      p.article, tv(p.glassLabel, 'ru'), tv(p.glassLabel, 'en'),
      tv(p.volumeLabel, 'ru'), tv(p.volumeLabel, 'en'),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function setOverride(productId, patch) {
  const current = db.overrides[String(productId)] || {};
  const next = { ...current, ...patch };
  for (const key of Object.keys(next)) {
    if (next[key] === null || next[key] === undefined) delete next[key];
  }
  if (Object.keys(next).length) db.overrides[String(productId)] = next;
  else delete db.overrides[String(productId)];
  save();
  return findProduct(productId);
}

// ─── витрина: локализованные срезы ────────────────────────────

/** Товар для витрины: все тексты — строками на нужном языке. */
export function localizeProduct(product, locale = DEFAULT_LOCALE) {
  return {
    id: product.id,
    article: product.article,
    category: product.category,
    collectionLabel: tv(categoryTitle(product.category, locale), locale),
    name: tv(product.name, locale),
    nameEn: tv(product.name, 'en'),
    description: tv(product.description, locale),
    price: Number.isFinite(product.price) ? product.price : null,
    priceUsd: Number.isFinite(product.priceUsd) ? product.priceUsd : null,
    currency: config.shop.currency,
    volumeMl: product.volumeMl ?? null,
    volumeLabel: tv(product.volumeLabel, locale),
    heightMm: product.heightMm ?? null,
    diameterMm: product.diameterMm ?? null,
    material: tv(product.material, locale),
    glassLabel: tv(product.glassLabel, locale),
    engraving: Boolean(product.engraving),
    handBlown: Boolean(product.handBlown),
    image: product.image,
    specs: (product.specs || []).map((s) => ({ key: tv(s.key, locale), value: tv(s.value, locale) })),
    isNew: Boolean(product.isNew),
    isHit: Boolean(product.isHit),
    comingSoon: Boolean(product.comingSoon),
    outOfStock: Boolean(product.outOfStock),
    priceOnRequest: product.price === null || product.price === undefined,
    hidden: Boolean(product.hidden),
    custom: Boolean(product.custom),
  };
}

export function publicProductList(locale) {
  return publicProducts().map((p) => localizeProduct(p, locale));
}

// ─── CRUD товаров ─────────────────────────────────────────────

const PRODUCT_FIELDS = [
  'name', 'nameEn', 'article', 'category', 'price', 'priceUsd', 'volumeMl', 'heightMm',
  'diameterMm', 'volumeLabel', 'image', 'isNew', 'isHit', 'description', 'descriptionEn',
  'hidden', 'outOfStock', 'comingSoon',
];

function nextProductId() {
  const used = new Set(allProducts().map((p) => String(p.id)));
  let max = 0;
  for (const id of used) {
    const m = String(id).match(/^AG(\d{4})$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (let n = max + 1; n < 9999; n += 1) {
    const candidate = `AG${String(n).padStart(4, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  return `AG${Date.now().toString(36).toUpperCase()}`;
}

function articleTaken(article, exceptId = null) {
  const a = String(article || '').trim().toLowerCase();
  if (!a) return false;
  return allProducts().some(
    (p) => String(p.article || '').trim().toLowerCase() === a && String(p.id) !== String(exceptId),
  );
}

function bilingual(value, fallback = '') {
  if (value && typeof value === 'object') {
    return {
      ru: String(value.ru ?? value.en ?? fallback).slice(0, 2000),
      en: String(value.en ?? value.ru ?? fallback).slice(0, 2000),
    };
  }
  const text = String(value ?? fallback).slice(0, 2000);
  return { ru: text, en: text };
}

function normalizeProductInput(data, { partial = false } = {}) {
  const out = {};
  if (data.name !== undefined) {
    const name = bilingual(data.name);
    if (!name.ru && !name.en && !partial) throw new Error('Укажите название товара');
    if (data.nameEn === undefined) out.name = { ru: name.ru, en: name.ru };
    else out.name = { ru: name.ru, en: bilingual(data.nameEn).en || name.ru };
  } else if (!partial) {
    throw new Error('Укажите название товара');
  }
  if (data.nameEn !== undefined && data.name === undefined) {
    const current = { ru: bilingual(data.nameEn).ru, en: bilingual(data.nameEn).en };
    out.name = current;
  }
  if (data.article !== undefined) {
    const article = String(data.article || '').trim().slice(0, 40);
    if (article) out.article = article;
  }
  if (data.category !== undefined) {
    const category = String(data.category || '').trim();
    if (category) {
      if (!findCategory(category, 'ru')) throw new Error('Коллекция не найдена');
      out.category = category;
    } else if (!partial) throw new Error('Укажите коллекцию');
  } else if (!partial) {
    throw new Error('Укажите коллекцию');
  }
  if (data.price !== undefined) {
    const raw = String(data.price).trim();
    if (raw === '' || raw === '-' || /^(по запросу|on request)$/i.test(raw)) {
      out.price = null;
      out.priceOnRequest = true;
    } else {
      const price = Math.round(Number(raw.replace(/[^\d.,]/g, '').replace(',', '.')));
      if (!Number.isFinite(price) || price <= 0) throw new Error('Цена должна быть положительным числом');
      out.price = price;
      out.priceOnRequest = false;
    }
  } else if (!partial) {
    throw new Error('Укажите цену');
  }
  if (data.priceUsd !== undefined) out.priceUsd = Number.isFinite(Number(data.priceUsd)) ? Number(data.priceUsd) : null;
  for (const [key, max] of [['volumeMl', 100000], ['heightMm', 5000], ['diameterMm', 5000]]) {
    if (data[key] !== undefined) {
      const v = Number.parseInt(data[key], 10);
      out[key] = Number.isFinite(v) && v > 0 && v <= max ? v : null;
    }
  }
  if (data.volumeLabel !== undefined) out.volumeLabel = bilingual(data.volumeLabel);
  if (data.description !== undefined) out.description = bilingual(data.description);
  else if (data.descriptionEn !== undefined) out.description = bilingual(data.descriptionEn);
  if (data.image !== undefined) out.image = String(data.image || '').trim().slice(0, 300);
  for (const flag of ['isNew', 'isHit', 'hidden', 'outOfStock', 'comingSoon']) {
    if (data[flag] !== undefined) out[flag] = Boolean(data[flag]);
  }
  return out;
}

export function createProduct(data) {
  const patch = normalizeProductInput(data);
  if (!patch.article) patch.article = nextProductId();
  if (articleTaken(patch.article)) throw new Error(`Артикул «${patch.article}» уже занят`);
  const categories = getCategories('ru');
  if (!patch.category) patch.category = categories[0]?.id;
  if (!patch.category) throw new Error('Нет ни одной коллекции — создайте её сначала');

  let id = String(data.id || '').trim() || patch.article;
  const used = new Set(allProducts().map((p) => String(p.id)));
  if (used.has(id) || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = nextProductId();

  const product = {
    id,
    article: patch.article,
    name: patch.name,
    category: patch.category,
    price: patch.price ?? null,
    priceUsd: patch.priceUsd ?? null,
    volumeMl: patch.volumeMl ?? null,
    heightMm: patch.heightMm ?? null,
    diameterMm: patch.diameterMm ?? null,
    volumeLabel: patch.volumeLabel || { ru: patch.volumeMl ? `${patch.volumeMl} мл` : '—', en: patch.volumeMl ? `${patch.volumeMl} ml` : '—' },
    material: { ru: 'Хрусталь без свинца, ручная выдувка', en: 'Lead-free crystal, hand-blown' },
    glassLabel: { ru: 'Позиция каталога', en: 'Catalogue piece' },
    description: patch.description || { ru: '', en: '' },
    specs: [],
    image: patch.image || '',
    isNew: Boolean(patch.isNew),
    isHit: Boolean(patch.isHit),
    comingSoon: Boolean(patch.comingSoon),
    outOfStock: Boolean(patch.outOfStock) || Boolean(patch.comingSoon),
    hidden: Boolean(patch.hidden),
    handBlown: true,
    createdAt: Date.now(),
  };
  db.customProducts[id] = product;
  save();
  return findProduct(id);
}

export function updateProduct(id, data) {
  const key = String(id);
  const patch = normalizeProductInput(data, { partial: true });
  if (patch.article && articleTaken(patch.article, key)) throw new Error(`Артикул «${patch.article}» уже занят`);

  if (db.customProducts[key]) {
    Object.assign(db.customProducts[key], patch);
    save();
    return findProduct(key);
  }
  if (!baseList().some((p) => String(p.id) === key)) throw new Error('Товар не найден');
  if (patch.article && patch.article !== key) {
    // артикул базового товара не меняем, но сохраняем как поле
    db.overrides[key] = { ...(db.overrides[key] || {}), article: patch.article };
    delete patch.article;
  }
  if (Object.keys(patch).length) setOverride(key, patch);
  return findProduct(key);
}

export function deleteProduct(id) {
  const key = String(id);
  if (db.customProducts[key]) {
    delete db.customProducts[key];
    save();
    return true;
  }
  if (!baseList().some((p) => String(p.id) === key)) throw new Error('Товар не найден');
  if (!(db.deletedProducts || []).includes(key)) {
    db.deletedProducts.push(key);
    delete db.overrides[key];
  }
  save();
  return true;
}

export function restoreProduct(id) {
  const key = String(id);
  db.deletedProducts = (db.deletedProducts || []).filter((x) => String(x) !== key);
  const patch = db.overrides[key];
  if (patch) {
    delete patch.hidden;
    if (!Object.keys(patch).length) delete db.overrides[key];
  }
  save();
  return findProduct(key);
}

/** Здоровье витрины: сколько позиций прайса видно, сколько удалено/скрыто. */
export function catalogHealth() {
  const baseTotal = (base.products || []).length;
  const visible = publicProducts().length;
  const deleted = (db.deletedProducts || []).filter((id) => (base.products || []).some((p) => p.id === id)).length;
  const hidden = Object.values(db.overrides || {}).filter((o) => o.hidden).length;
  return { baseTotal, visible, deleted, hidden, broken: baseTotal > 0 && visible === 0 };
}

export function restoreBaseCatalog({ unhide = true } = {}) {
  const before = (db.deletedProducts || []).length;
  db.deletedProducts = [];
  let unhidden = 0;
  if (unhide) {
    for (const [id, patch] of Object.entries(db.overrides || {})) {
      if (patch.hidden) {
        delete patch.hidden;
        unhidden += 1;
        if (!Object.keys(patch).length) delete db.overrides[id];
      }
    }
  }
  save();
  return { restored: before, unhidden, visible: publicProducts().length };
}

// ─── фото товаров ─────────────────────────────────────────────

const DATA_URL_RE = /^data:(image\/(jpeg|png|webp));base64,(.+)$/;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export function parsePhotoDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(DATA_URL_RE);
  if (!m) throw new Error('Нужно фото в формате JPEG/PNG/WebP');
  const ext = m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg';
  const buffer = Buffer.from(m[3], 'base64');
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Фото слишком большое (максимум 6 МБ)');
  }
  return { buffer, ext };
}

export function saveProductPhoto(id, buffer, ext = 'jpg') {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '_') || 'product';
  const fileName = `${safe}.${ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg'}`;
  if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  for (const other of [`${safe}.jpg`, `${safe}.png`, `${safe}.webp`, `${safe}.jpeg`]) {
    if (other !== fileName) {
      try { fs.unlinkSync(path.join(PRODUCTS_DIR, other)); } catch {}
    }
  }
  fs.writeFileSync(path.join(PRODUCTS_DIR, fileName), buffer);
  return `assets/products/${fileName}`;
}

// ─── коллекции ────────────────────────────────────────────────

export function getCategories(locale = DEFAULT_LOCALE) {
  const deleted = new Set(db.deletedCategories || []);
  const list = (base.categories || [])
    .filter((c) => !deleted.has(c.id))
    .map((c) => ({ ...c, ...(db.categoryOverrides[c.id] || {}), custom: false }));
  const custom = (db.customCategories || []).map((c) => ({ ...c, custom: true }));
  return [...list, ...custom].map((c) => ({
    id: c.id,
    emoji: c.emoji || '',
    title: tv(c.title, locale),
    subtitle: tv(c.subtitle, locale),
    titleRaw: c.title,
  }));
}

export function findCategory(id, locale = DEFAULT_LOCALE) {
  return getCategories(locale).find((c) => c.id === String(id)) || null;
}

function categoryTitle(id, locale = DEFAULT_LOCALE) {
  return findCategory(id, locale)?.title || id;
}

export function rawCategories() {
  return getCategories('ru').map((c) => ({
    id: c.id,
    title: c.titleRaw,
    emoji: c.emoji,
    custom: c.custom,
    count: allProducts().filter((p) => p.category === c.id).length,
  }));
}

function slugify(title) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
    ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return String(title || '').toLowerCase().split('').map((ch) => map[ch] ?? ch)
    .join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
    || `cat-${Date.now().toString(36)}`;
}

export function createCategory(data) {
  const title = bilingual(data.title);
  if (!title.ru && !title.en) throw new Error('Укажите название коллекции');
  let id = String(data.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || slugify(title.en || title.ru);
  if (findCategory(id)) id = `${id}-${Date.now().toString(36)}`;
  const category = {
    id,
    title,
    subtitle: bilingual(data.subtitle, ''),
    emoji: String(data.emoji || '').trim().slice(0, 8),
  };
  db.customCategories.push(category);
  save();
  return findCategory(id);
}

export function updateCategory(id, data) {
  const key = String(id);
  const patch = {};
  if (data.title !== undefined) {
    const title = bilingual(data.title);
    if (!title.ru && !title.en) throw new Error('Название коллекции не может быть пустым');
    patch.title = title;
  }
  if (data.subtitle !== undefined) patch.subtitle = bilingual(data.subtitle, '');
  if (data.emoji !== undefined) patch.emoji = String(data.emoji || '').trim().slice(0, 8);

  const idx = db.customCategories.findIndex((c) => c.id === key);
  if (idx !== -1) {
    Object.assign(db.customCategories[idx], patch);
    save();
    return findCategory(key);
  }
  const isBase = (base.categories || []).some((c) => c.id === key);
  if (!isBase || (db.deletedCategories || []).includes(key)) throw new Error('Коллекция не найдена');
  db.categoryOverrides[key] = { ...(db.categoryOverrides[key] || {}), ...patch };
  save();
  return findCategory(key);
}

export function deleteCategory(id) {
  const key = String(id);
  const count = allProducts().filter((p) => p.category === key).length;
  if (count) throw new Error(`В коллекции ${count} поз. — сначала перенесите их`);
  const idx = db.customCategories.findIndex((c) => c.id === key);
  if (idx !== -1) {
    db.customCategories.splice(idx, 1);
    save();
    return true;
  }
  const isBase = (base.categories || []).some((c) => c.id === key);
  if (!isBase) throw new Error('Коллекция не найдена');
  if (!db.deletedCategories.includes(key)) db.deletedCategories.push(key);
  delete db.categoryOverrides[key];
  save();
  return true;
}

// ─── бренд, доставка, магазин, тексты ─────────────────────────

/** Сливает базовое значение ({ru,en}) с правкой админа (тоже {ru,en}). */
function mergeBilingual(baseValue, override) {
  const b = baseValue && typeof baseValue === 'object' ? baseValue : { ru: baseValue || '', en: baseValue || '' };
  const o = override && typeof override === 'object' ? override : {};
  return { ru: o.ru ?? b.ru, en: o.en ?? b.en };
}

export function getBrand(locale = DEFAULT_LOCALE) {
  const baseBrand = base.brand || {};
  const ov = db.shopInfo?.brand || {};
  const managers = (ov.managers || baseBrand.managers || []).map((m) => ({
    name: m.name || '',
    region: m.region || '',
    phone: m.phone || '',
    telegram: m.telegram || '',
    whatsapp: m.whatsapp || '',
  }));
  return {
    name: ov.name || baseBrand.name || config.brandName,
    legalName: ov.legalName || baseBrand.legalName || '',
    tagline: tv(mergeBilingual(baseBrand.tagline, ov.tagline), locale),
    about: tv(mergeBilingual(baseBrand.about, ov.about), locale),
    instagram: ov.instagram ?? baseBrand.instagram ?? '',
    telegram: ov.telegram ?? baseBrand.telegram ?? '',
    whatsapp: ov.whatsapp ?? baseBrand.whatsapp ?? '',
    phone: ov.phone ?? baseBrand.phone ?? '',
    email: ov.email ?? baseBrand.email ?? '',
    city: ov.city ?? baseBrand.city ?? 'Dubai',
    country: ov.country ?? baseBrand.country ?? 'UAE',
    address: ov.address ?? baseBrand.address ?? '',
    currency: config.shop.currency,
    usdRate: config.shop.usdRate,
    managers,
  };
}

export function getBrandRaw() {
  const brand = getBrand('ru');
  const baseBrand = base.brand || {};
  return {
    ...brand,
    tagline: mergeBilingual(baseBrand.tagline, db.shopInfo?.brand?.tagline),
    about: mergeBilingual(baseBrand.about, db.shopInfo?.brand?.about),
  };
}

export function getDeliveryInfo(locale = DEFAULT_LOCALE) {
  const baseDelivery = base.delivery || {};
  const ov = db.shopInfo?.delivery || {};
  return {
    note: tv(mergeBilingual(baseDelivery.note, ov.note), locale),
    freeCities: ov.freeCities || baseDelivery.freeCities || [],
    freeFromAed: ov.freeFromAed ?? baseDelivery.freeFromAed ?? config.shop.freeShippingFrom,
  };
}

export function getShopSettings() {
  return {
    currency: config.shop.currency,
    usdRate: config.shop.usdRate,
    freeShippingFrom: Number(db.shopInfo?.shop?.freeShippingFrom ?? config.shop.freeShippingFrom) || 0,
    shippingCost: Number(db.shopInfo?.shop?.shippingCost ?? config.shop.shippingCost) || 0,
    minOrderTotal: Number(db.shopInfo?.shop?.minOrderTotal ?? config.shop.minOrderTotal) || 0,
    wholesaleFrom: Number(db.shopInfo?.shop?.wholesaleFrom ?? config.shop.wholesaleFrom) || 0,
  };
}

export function getSeller() {
  const merged = { ...config.seller, ...(db.shopInfo?.seller || {}) };
  return { ...merged, configured: Boolean(merged.iban || merged.accountNumber) };
}

const DEFAULT_TEXTS = {
  welcome: {
    ru: '{name}, приветствуем в Cocktail Embassy 🥂\n\nБарное стекло ручной выдувки из Дубая: тонкий хрусталь, 9 коллекций, отгрузка по ОАЭ и миру за 1–2 дня.',
    en: '{name}, welcome to Cocktail Embassy 🥂\n\nHand-blown bar glassware from Dubai: thin crystal, 9 collections, dispatch across the UAE and worldwide in 1–2 days.',
  },
  delivery: {
    ru: '<b>Доставка и оплата</b>\n\nСобираем и отгружаем заказ за 1–2 рабочих дня после оплаты.\n• Дубай — бесплатно\n• Остальные эмираты — 50 AED, бесплатно от 1000 AED\n• Экспорт (DHL / FedEx) — считаем индивидуально\n\n<b>Оплата:</b> инвойс на компанию (банковский перевод, VAT 5%) или картой онлайн.',
    en: '<b>Delivery &amp; payment</b>\n\nWe pack and dispatch within 1–2 working days after payment.\n• Dubai — free\n• Other Emirates — AED 50, free over AED 1000\n• Export (DHL / FedEx) — quoted individually\n\n<b>Payment:</b> company invoice (bank transfer, VAT 5%) or card online.',
  },
  about: {
    ru: 'Cocktail Embassy — поставщик барного и ресторанного стекла из Дубая: тонкий японский хрусталь и ручная выдувка для HoReCa.',
    en: 'Cocktail Embassy is a Dubai-based supplier of bar and restaurant glassware: thin Japanese crystal and hand-blowing for HoReCa.',
  },
  footerNote: {
    ru: 'Цены за штуку, AED. Прайс Cocktail Embassy.',
    en: 'Prices per piece, AED. Cocktail Embassy price list.',
  },
};

export function getTexts(locale = DEFAULT_LOCALE) {
  const ov = db.shopInfo?.texts || {};
  const out = {};
  for (const [key, value] of Object.entries(DEFAULT_TEXTS)) {
    out[key] = tv(mergeBilingual(value, ov[key]), locale);
  }
  return { ...out, raw: Object.fromEntries(Object.entries(DEFAULT_TEXTS).map(([k, v]) => [k, mergeBilingual(v, ov[k])])) };
}

export function getShopInfo() {
  return {
    brand: getBrandRaw(),
    delivery: {
      ...getDeliveryInfo('ru'),
      note: mergeBilingual((base.delivery || {}).note, db.shopInfo?.delivery?.note),
    },
    shop: getShopSettings(),
    seller: getSeller(),
    texts: getTexts('ru').raw,
    categories: rawCategories(),
  };
}

const SHOP_SECTIONS = ['brand', 'delivery', 'shop', 'seller', 'texts'];

export function updateShopInfo(patch) {
  db.shopInfo = db.shopInfo || {};
  for (const section of SHOP_SECTIONS) {
    if (patch[section] && typeof patch[section] === 'object') {
      const current = db.shopInfo[section] || {};
      const next = { ...current };
      for (const [key, value] of Object.entries(patch[section])) {
        if (value === null || value === undefined) delete next[key];
        else if (typeof value === 'string') next[key] = value.slice(0, 4000);
        else if (typeof value === 'object' && !Array.isArray(value)) {
          const localized = {};
          for (const [lang, text] of Object.entries(value)) {
            if (!isLocale(lang)) continue;
            localized[lang] = String(text ?? '').slice(0, 4000);
          }
          next[key] = Object.keys(localized).length ? localized : next[key];
        } else next[key] = value;
      }
      if (section === 'shop') {
        for (const key of ['freeShippingFrom', 'shippingCost', 'minOrderTotal', 'wholesaleFrom']) {
          if (next[key] !== undefined) {
            const v = Number(next[key]);
            next[key] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
          }
        }
      }
      if (section === 'seller') {
        if (next.vatRate !== undefined) {
          const v = Number(next.vatRate);
          next.vatRate = Number.isFinite(v) && v >= 0 ? v : 5;
        }
        if (next.vatIncluded !== undefined) next.vatIncluded = Boolean(next.vatIncluded);
      }
      if (section === 'delivery' && next.freeFromAed !== undefined) {
        const v = Number(next.freeFromAed);
        next.freeFromAed = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
      }
      db.shopInfo[section] = next;
    }
  }
  save();
  return getShopInfo();
}

export function catalogStats() {
  const products = allProducts();
  return {
    total: products.length,
    baseTotal: (base.products || []).length,
    visible: products.filter((p) => !p.hidden).length,
    hidden: products.filter((p) => p.hidden).length,
    outOfStock: products.filter((p) => p.outOfStock).length,
    edited: Object.keys(db.overrides).length,
    custom: Object.keys(db.customProducts || {}).length,
    deleted: (db.deletedProducts || []).length,
    categories: getCategories('ru').length,
  };
}

export { PRODUCT_FIELDS, base as baseCatalog };
