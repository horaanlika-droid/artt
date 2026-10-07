/** Форматирование сообщений бота (ru/en). */
import { config } from '../config.js';
import { tv, t, DEFAULT_LOCALE } from '../i18n.js';
import { localizeProduct, getBrand } from '../catalog.js';
import { ORDER_STATUSES, DELIVERY_METHODS } from '../orders.js';
import { getSeller } from '../catalog.js';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const moneyAed = (value) => `${new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Number(value) || 0)} AED`;

export function usdHint(value) {
  const rate = config.shop.usdRate;
  if (!Number.isFinite(Number(value)) || !rate) return '';
  const usd = Number(value) * rate;
  return `≈ $${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd)}`;
}

export function statusTitle(status, locale = DEFAULT_LOCALE) {
  const meta = ORDER_STATUSES[status];
  return meta ? `${meta.emoji} ${tv(meta.title, locale)}` : status;
}

export function deliveryTitle(method, locale = DEFAULT_LOCALE) {
  return tv(DELIVERY_METHODS[method]?.title, locale) || (locale === 'en' ? 'Delivery' : 'Доставка');
}

/** Карточка товара для чата. */
export function productCaption(product, locale = DEFAULT_LOCALE) {
  const p = localizeProduct(product, locale);
  const lines = [
    `<b>${esc(p.name)}</b>`,
    `${esc(p.glassLabel)}${p.volumeLabel && p.volumeLabel !== '—' ? ` · ${esc(p.volumeLabel)}` : ''}`,
    '',
  ];
  if (p.price === null) {
    lines.push(`<b>${t('product.ask', locale)}</b>`);
  } else {
    lines.push(`<b>${moneyAed(p.price)}</b>  ${esc(usdHint(p.priceUsd ?? p.price))}`);
  }
  lines.push(`${t('common.article', locale)} ${esc(p.article)}`);
  if (p.comingSoon) lines.push(`⏳ ${t('product.comingSoon', locale)}`);
  else if (p.outOfStock) lines.push(`🚫 ${t('product.outOfStock', locale)}`);
  return lines.join('\n');
}

/** Подпись заказа для админа. */
export function adminOrderCaption(order, locale = 'ru') {
  const rows = [
    `<b>${esc(order.number)}</b> · ${moneyAed(order.total)}`,
    statusTitle(order.status, locale),
    '',
  ];
  for (const it of order.items) {
    rows.push(`• ${esc(it.name)} × ${it.qty} = ${moneyAed(it.price * it.qty)}`);
  }
  rows.push('', `${esc(order.customer.name)}, ${esc(order.customer.phone)}`);
  if (order.company) rows.push(`${esc(order.company.name)}${order.company.trn ? ` · TRN ${esc(order.company.trn)}` : ''}`);
  rows.push(deliveryTitle(order.delivery.method, locale)
    + [order.delivery.city, order.delivery.address].filter(Boolean).map((x) => `, ${esc(x)}`).join(''));
  if (order.invoiceNumber) rows.push(`📄 ${t('invoice.number', locale)} ${esc(order.invoiceNumber)}`);
  if (order.comment) rows.push(`💬 ${esc(order.comment)}`);
  return rows.join('\n');
}

/** Компактная строка заказа для списков. */
export function adminOrderLine(order) {
  return `${statusTitle(order.status, 'ru')} · <b>${esc(order.number)}</b> · ${moneyAed(order.total)} · ${esc(order.customer.name || '')}`;
}

/** Реквизиты продавца для счёта (в чате). */
export function sellerLines(locale = DEFAULT_LOCALE) {
  const s = getSeller();
  const brand = getBrand(locale);
  const out = [`<b>${esc(s.legalName || brand.name)}</b>`];
  if (s.address) out.push(esc(s.address));
  if (s.trn) out.push(`TRN: ${esc(s.trn)}`);
  if (s.bankName) out.push(`Bank: ${esc(s.bankName)}`);
  if (s.accountName) out.push(`Account: ${esc(s.accountName)}`);
  if (s.iban) out.push(`IBAN: <code>${esc(s.iban)}</code>`);
  if (s.swift) out.push(`SWIFT: <code>${esc(s.swift)}</code>`);
  if (s.phone || s.email) out.push([s.phone, s.email].filter(Boolean).map(esc).join(' · '));
  return out.join('\n');
}

export { t, tv };
