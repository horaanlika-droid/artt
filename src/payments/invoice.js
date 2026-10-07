/**
 * Коммерческий инвойс (ОАЭ): номер, суммы с VAT 5%, печатная HTML-версия A4.
 * Реквизиты продавца: переменные окружения (SELLER_*) + правки из админки.
 */
import { config } from '../config.js';
import { db, save } from '../store.js';
import { getSeller, getBrand } from '../catalog.js';
import { tv, DEFAULT_LOCALE } from '../i18n.js';

const MONTHS = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export function nextInvoiceNumber() {
  db.counters.invoice = (db.counters.invoice || 0) + 1;
  save();
  const year = new Date().getFullYear();
  const prefix = getSeller().invoicePrefix || 'CE-';
  return `${prefix}${year}-${String(db.counters.invoice).padStart(4, '0')}`;
}

export function formatDate(ts, locale = DEFAULT_LOCALE) {
  const d = new Date(ts);
  const months = MONTHS[locale] || MONTHS.ru;
  if (locale === 'en') return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
}

const money = (v, locale = DEFAULT_LOCALE) =>
  new Intl.NumberFormat(locale === 'en' ? 'en-AE' : 'ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(v) || 0);

/** Разбивка VAT: цена может включать налог или начисляться сверху. */
export function vatBreakdown(total) {
  const seller = getSeller();
  const rate = Number(seller.vatRate) || 0;
  if (!rate) return { rate: 0, amount: 0, net: total, included: false, label: { ru: 'VAT не начисляется', en: 'VAT not applicable' } };
  if (seller.vatIncluded) {
    const net = total / (1 + rate / 100);
    return {
      rate,
      amount: total - net,
      net,
      included: true,
      label: { ru: `В том числе VAT ${rate}%`, en: `VAT ${rate}% included` },
    };
  }
  return {
    rate,
    amount: total * (rate / 100),
    net: total,
    included: false,
    label: { ru: `VAT ${rate}%`, en: `VAT ${rate}%` },
  };
}

// ─── сумма прописью (AED / филсы) ─────────────────────────────
const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function pluralRu(n, forms) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

function tripleRu(n, female = false) {
  const ones = [...ONES];
  if (female) {
    ones[1] = 'одна';
    ones[2] = 'две';
  }
  const out = [];
  if (n >= 100) out.push(HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest >= 20) {
    out.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) out.push(ones[rest % 10]);
  } else if (rest) out.push(ones[rest]);
  return out.filter(Boolean).join(' ');
}

const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function tripleEn(n) {
  const out = [];
  if (n >= 100) {
    out.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
    if (n % 100) out.push('and');
  }
  const rest = n % 100;
  if (rest >= 20) {
    out.push(EN_TENS[Math.floor(rest / 10)]);
    if (rest % 10) out.push(EN_ONES[rest % 10]);
  } else if (rest) out.push(EN_ONES[rest]);
  return out.filter(Boolean).join(' ');
}

/** Сумма прописью: dirhams/fils. */
export function amountInWords(amount, locale = DEFAULT_LOCALE) {
  const total = Math.max(0, Number(amount) || 0);
  const whole = Math.floor(total);
  const fils = Math.round((total - whole) * 100);

  if (locale === 'en') {
    const words = (n) => {
      if (!n) return 'zero';
      const parts = [];
      const millions = Math.floor(n / 1_000_000);
      const thousands = Math.floor((n % 1_000_000) / 1000);
      const units = n % 1000;
      if (millions) parts.push(`${tripleEn(millions)} million`);
      if (thousands) parts.push(`${tripleEn(thousands)} thousand`);
      if (units || !parts.length) parts.push(tripleEn(units));
      return parts.filter(Boolean).join(' ');
    };
    const dirham = whole === 1 ? 'dirham' : 'dirhams';
    const fil = fils === 1 ? 'fils' : 'fils';
    return `${words(whole)} ${dirham} ${String(fils).padStart(2, '0')} ${fil} only`;
  }

  const parts = [];
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1000);
  const units = whole % 1000;
  if (millions) parts.push(tripleRu(millions), pluralRu(millions, ['миллион', 'миллиона', 'миллионов']));
  if (thousands) parts.push(tripleRu(thousands, true), pluralRu(thousands, ['тысяча', 'тысячи', 'тысяч']));
  if (units || !whole) parts.push(tripleRu(units));
  const words = parts.filter(Boolean).join(' ').trim() || 'ноль';
  const dirhamWord = pluralRu(whole, ['дирхам', 'дирхама', 'дирхамов']);
  const filWord = pluralRu(fils, ['филс', 'филса', 'филсов']);
  const text = `${words} ${dirhamWord} ${String(fils).padStart(2, '0')} ${filWord}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Краткая сводка для витрины и бота. */
export function invoiceSummary(order) {
  const seller = getSeller();
  const vat = vatBreakdown(order.total);
  const locale = order.locale || DEFAULT_LOCALE;
  return {
    number: order.invoiceNumber,
    date: formatDate(order.createdAt, locale),
    total: order.total,
    currency: order.currency || config.shop.currency,
    subtotal: order.subtotal,
    shipping: order.shipping,
    vat: { rate: vat.rate, amount: Number(vat.amount.toFixed(2)), included: vat.included, label: tv(vat.label, locale) },
    amountInWords: amountInWords(order.total, locale),
    seller: {
      legalName: seller.legalName || seller.name,
      address: seller.address,
      trn: seller.trn,
      licence: seller.licence,
      bankName: seller.bankName,
      iban: seller.iban,
      swift: seller.swift,
      accountName: seller.accountName,
      accountNumber: seller.accountNumber,
      phone: seller.phone,
      email: seller.email,
      configured: seller.configured,
    },
    buyer: {
      name: order.company?.name || order.customer?.name || '',
      trn: order.company?.trn || order.company?.vat || '',
      address: order.company?.address || [order.delivery?.city, order.delivery?.address].filter(Boolean).join(', '),
      email: order.company?.email || order.customer?.email || '',
      phone: order.customer?.phone || '',
    },
    url: `/invoice/${order.id}?k=${order.invoiceKey || ''}&lang=${locale}`,
  };
}

const T = {
  title: { ru: 'Коммерческий инвойс', en: 'Commercial invoice' },
  invoiceNo: { ru: 'Инвойс №', en: 'Invoice no.' },
  date: { ru: 'Дата', en: 'Date' },
  seller: { ru: 'Продавец', en: 'Seller' },
  buyer: { ru: 'Покупатель', en: 'Buyer' },
  item: { ru: 'Наименование', en: 'Description' },
  article: { ru: 'Артикул', en: 'Article' },
  qty: { ru: 'Кол-во', en: 'Qty' },
  price: { ru: 'Цена', en: 'Unit price' },
  sum: { ru: 'Сумма', en: 'Amount' },
  subtotal: { ru: 'Товары', en: 'Subtotal' },
  shipping: { ru: 'Доставка', en: 'Delivery' },
  total: { ru: 'Итого к оплате', en: 'Total due' },
  inWords: { ru: 'Сумма прописью', en: 'Amount in words' },
  bank: { ru: 'Банковские реквизиты', en: 'Bank details' },
  terms: { ru: 'Условия', en: 'Terms' },
  termsText: {
    ru: 'Оплата в течение 5 рабочих дней. Товар отгружается после поступления средств. Доставка за счёт покупателя, если не указано иное.',
    en: 'Payment within 5 working days. Goods are dispatched after funds are received. Delivery at buyer’s cost unless agreed otherwise.',
  },
  signature: { ru: 'Подпись и печать', en: 'Signature & stamp' },
  print: { ru: 'Печать / PDF', en: 'Print / PDF' },
  currency: { ru: 'Валюта', en: 'Currency' },
};

/** HTML-версия инвойса (A4, печатается в PDF средствами браузера). */
export function renderInvoiceHtml(order) {
  const locale = order.locale || DEFAULT_LOCALE;
  const tr = (key) => tv(T[key], locale);
  const summary = invoiceSummary(order);
  const brand = getBrand(locale);
  const seller = summary.seller;
  const buyer = summary.buyer;
  const vat = summary.vat;

  const rows = (order.items || []).map((it, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td><b>${esc(it.name)}</b>${it.volumeLabel && it.volumeLabel !== '—' ? `<div class="sub">${esc(it.volumeLabel)}</div>` : ''}</td>
        <td class="mono">${esc(it.article)}</td>
        <td class="num mono">${it.qty}</td>
        <td class="num mono">${money(it.price, locale)}</td>
        <td class="num mono">${money(it.price * it.qty, locale)}</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tr('title')} ${esc(summary.number)}</title>
<style>
  :root { --ink: #14141a; --muted: #6b6b76; --line: #d8d6d0; --gold: #a8802f; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: #f4f3f0; color: var(--ink);
         font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .sheet { max-width: 820px; margin: 0 auto 24px; background: #fff; padding: 34px 38px 42px;
           box-shadow: 0 10px 40px rgba(0,0,0,.12); }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid var(--ink); padding-bottom: 14px; }
  .brand { font: 600 21px/1.1 Georgia, serif; letter-spacing: .04em; }
  .brand small { display: block; margin-top: 5px; font: 400 11.5px/1.4 var(--font, sans-serif); letter-spacing: .18em;
                 text-transform: uppercase; color: var(--muted); }
  h1 { margin: 0; font-size: 19px; letter-spacing: .02em; text-align: right; }
  h1 span { display: block; margin-top: 4px; font: 600 15px/1.2 ui-monospace, monospace; color: var(--gold); }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin: 22px 0 6px; }
  .party h2 { margin: 0 0 6px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .party div { font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th, td { padding: 8px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); border-bottom: 1.5px solid var(--ink); }
  td.num, th.num { text-align: right; }
  td .sub { color: var(--muted); font-size: 12px; }
  .mono { font-family: ui-monospace, Menlo, monospace; }
  .totals { margin-top: 14px; margin-left: auto; width: 330px; }
  .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; }
  .totals .grand { border-top: 1.5px solid var(--ink); margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: 700; }
  .words { margin-top: 12px; padding: 11px 13px; background: #faf9f6; border: 1px solid var(--line); font-size: 13px; }
  .box { margin-top: 20px; padding: 14px 16px; border: 1px solid var(--line); }
  .box h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .box div { font-size: 13px; line-height: 1.6; }
  .sign { margin-top: 34px; display: flex; justify-content: space-between; gap: 30px; font-size: 12.5px; color: var(--muted); }
  .sign div { flex: 1; border-top: 1px solid var(--line); padding-top: 7px; }
  .actions { max-width: 820px; margin: 0 auto 28px; display: flex; gap: 10px; justify-content: flex-end; }
  .actions button { padding: 11px 20px; border: 0; border-radius: 11px; background: #14141a; color: #fff;
                    font-size: 14px; font-weight: 600; cursor: pointer; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; margin: 0; max-width: none; padding: 16mm 14mm; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">${tr('print')}</button></div>
  <div class="sheet">
    <header>
      <div class="brand">
        ${esc(brand.name || 'Cocktail Embassy')}
        <small>${esc(brand.city || 'Dubai')}, ${esc(brand.country || 'UAE')}</small>
      </div>
      <h1>${tr('title')}<span>${esc(summary.number)}</span></h1>
    </header>

    <div class="parties">
      <div class="party">
        <h2>${tr('seller')}</h2>
        <div>
          <b>${esc(seller.legalName || '')}</b><br>
          ${esc(seller.address || '')}<br>
          ${seller.trn ? `${tr('currency') === 'Currency' ? 'TRN' : 'TRN'}: ${esc(seller.trn)}<br>` : ''}
          ${seller.licence ? `Licence: ${esc(seller.licence)}<br>` : ''}
          ${esc(seller.phone || '')}${seller.email ? ` · ${esc(seller.email)}` : ''}
        </div>
      </div>
      <div class="party" style="text-align:right">
        <h2>${tr('buyer')}</h2>
        <div>
          <b>${esc(buyer.name || '—')}</b><br>
          ${buyer.address ? `${esc(buyer.address)}<br>` : ''}
          ${buyer.trn ? `TRN: ${esc(buyer.trn)}<br>` : ''}
          ${esc(buyer.phone || '')}${buyer.email ? ` · ${esc(buyer.email)}` : ''}<br>
          <span class="mono">${tr('date')}: ${esc(summary.date)}</span>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num" style="width:34px">#</th>
          <th>${tr('item')}</th>
          <th style="width:96px">${tr('article')}</th>
          <th class="num" style="width:58px">${tr('qty')}</th>
          <th class="num" style="width:104px">${tr('price')}</th>
          <th class="num" style="width:112px">${tr('sum')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>${tr('subtotal')}</span><span class="mono">${money(summary.subtotal, locale)}</span></div>
      <div><span>${tr('shipping')}</span><span class="mono">${summary.shipping ? money(summary.shipping, locale) : '0.00'}</span></div>
      <div><span>${esc(vat.label)}</span><span class="mono">${money(vat.amount, locale)}</span></div>
      <div class="grand"><span>${tr('total')}</span><span class="mono">${money(summary.total, locale)} ${esc(summary.currency)}</span></div>
    </div>

    <div class="words"><b>${tr('inWords')}:</b> ${esc(summary.amountInWords)}</div>

    ${seller.configured ? `<div class="box">
      <h2>${tr('bank')}</h2>
      <div>
        ${seller.bankName ? `Bank: <b>${esc(seller.bankName)}</b><br>` : ''}
        ${seller.accountName ? `Account name: <b>${esc(seller.accountName)}</b><br>` : ''}
        ${seller.iban ? `IBAN: <span class="mono">${esc(seller.iban)}</span><br>` : ''}
        ${seller.swift ? `SWIFT: <span class="mono">${esc(seller.swift)}</span><br>` : ''}
        ${seller.accountNumber ? `Account: <span class="mono">${esc(seller.accountNumber)}</span><br>` : ''}
        Reference: <b>${esc(summary.number)}</b>
      </div>
    </div>` : ''}

    <div class="box">
      <h2>${tr('terms')}</h2>
      <div>${esc(tv(T.termsText, locale))}</div>
    </div>

    <div class="sign">
      <div>${tr('signature')}</div>
      <div style="text-align:center">${esc(brand.name || '')}</div>
    </div>
  </div>
</body>
</html>`;
}
