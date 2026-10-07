/**
 * Админ-панель в боте: заказы, поддержка, каталог, коллекции, магазин и контакты,
 * статистика, рассылка, настройки. Доступна только ID из ADMIN_IDS.
 *
 * Подписи — на русском: панелью пользуется команда магазина.
 */
import { InlineKeyboard, InputFile } from 'grammy';
import { config, isAdmin, paymentMethods } from '../config.js';
import { db, save, getUser, userTitle } from '../store.js';
import {
  allProducts, findProduct, localizeProduct, getCategories, rawCategories, searchProducts,
  updateProduct, createProduct, deleteProduct, restoreProduct, createCategory, updateCategory,
  deleteCategory, setOverride, getShopInfo, updateShopInfo, catalogStats, catalogHealth,
  restoreBaseCatalog, parsePhotoDataUrl, saveProductPhoto,
} from '../catalog.js';
import { getOrder, getOrderByNumber, updateOrder, markPaid, setStatus, orderStats, ORDER_STATUSES } from '../orders.js';
import { listThreads, getThread, addAdminMessage, markAdminRead, supportStats } from '../support.js';
import { t, tv, isLocale } from '../i18n.js';
import { esc, moneyAed, statusTitle, adminOrderLine, adminOrderCaption, sellerLines } from './format.js';

const PAGE = 6;
const flows = new Map(); // админ -> { type, step, payload }

const setFlow = (id, flow) => flows.set(Number(id), flow);
const clearFlow = (id) => flows.delete(Number(id));
const getFlow = (id) => flows.get(Number(id)) || null;

export function adminMenu() {
  return new InlineKeyboard()
    .text('📦 Заказы', 'admin:orders:all').text('💬 Поддержка', 'admin:support').row()
    .text('🍸 Каталог', 'admin:catalog:0').text('🗂 Коллекции', 'admin:cats').row()
    .text('🏪 Магазин и контакты', 'admin:shop').row()
    .text('📊 Статистика', 'admin:stats').text('📣 Рассылка', 'admin:broadcast').row()
    .text('⚙️ Настройки', 'admin:settings');
}

const homeText = () => [
  '🍸 <b>Cocktail Embassy · админ-панель</b>',
  '',
  'Заказы, поддержка, каталог, коллекции, магазин и контакты, статистика, рассылка.',
].join('\n');

async function show(ctx, text, keyboard) {
  const options = { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } };
  try {
    await ctx.editMessageText(text, options);
  } catch {
    await ctx.reply(text, options);
  }
}

function ordersKeyboard(filter) {
  const kb = new InlineKeyboard()
    .text(filter === 'all' ? '• Все' : 'Все', 'admin:orders:all')
    .text(filter === 'active' ? '• Активные' : 'Активные', 'admin:orders:active')
    .text(filter === 'paid' ? '• Оплаченные' : 'Оплаченные', 'admin:orders:paid').row()
    .text('📄 По инвойсу', 'admin:orders:invoice').text('🔍 Поиск', 'admin:orders:search').row()
    .text('🏠 Меню', 'admin:home');
  return kb;
}

function ordersText(filter) {
  let list = db.orders;
  if (filter === 'active') list = list.filter((o) => !['done', 'canceled'].includes(o.status));
  if (filter === 'paid') list = list.filter((o) => o.paymentStatus === 'paid');
  if (filter === 'invoice') list = list.filter((o) => o.paymentMethod === 'invoice');
  if (!list.length) return 'Заказов нет.';
  return `📦 <b>Заказы</b> (${list.length}):\n\n` + list.slice(0, 12)
    .map((o) => `• ${adminOrderLine(o)}\n   <code>${o.id.slice(0, 8)}</code>`)
    .join('\n');
}

function orderKeyboard(order) {
  const kb = new InlineKeyboard();
  const statuses = ['paid', 'packing', 'shipped', 'done', 'canceled'];
  statuses.forEach((st, i) => {
    if (order.status === st) return;
    const meta = ORDER_STATUSES[st];
    kb.text(`${meta.emoji} ${tv(meta.title, 'ru')}`, `admin:setstatus:${order.id}:${st}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row();
  if (order.paymentStatus !== 'paid') {
    kb.text('✅ Отметить оплату', `admin:markpaid:${order.id}`);
  } else {
    kb.text('↩️ Снять оплату', `admin:unpaid:${order.id}`);
  }
  kb.row();
  if (order.invoiceNumber) {
    const url = `${config.publicUrl || ''}/invoice/${order.id}?k=${order.invoiceKey}&lang=${order.locale || 'ru'}`;
    kb.url(`📄 Инвойс ${order.invoiceNumber}`, url).row();
  }
  kb.text('💬 Клиенту', `admin:writeuser:${order.userId}`).text('👤 Профиль', `admin:user:${order.userId}`).row();
  kb.text('⬅️ К заказам', 'admin:orders:all').text('🏠 Меню', 'admin:home');
  return kb;
}

function catalogKeyboard(page) {
  const list = allProducts();
  const slice = list.slice(page * PAGE, page * PAGE + PAGE);
  const kb = new InlineKeyboard();
  slice.forEach((p) => {
    const info = localizeProduct(p, 'ru');
    const price = info.price === null ? 'по запросу' : moneyAed(info.price);
    const flags = [p.hidden ? '🙈' : '', p.outOfStock ? '🚫' : '', p.isHit ? '🔥' : '', p.isNew ? '🆕' : ''].filter(Boolean).join('');
    kb.text(`${flags} ${info.name.slice(0, 26)} · ${price}`, `admin:prod:${p.id}`).row();
  });
  const pages = Math.ceil(list.length / PAGE);
  if (pages > 1) {
    if (page > 0) kb.text('⬅️', `admin:catalog:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, 'admin:noop');
    if (page + 1 < pages) kb.text('➡️', `admin:catalog:${page + 1}`);
    kb.row();
  }
  kb.text('➕ Добавить позицию', 'admin:addprod').row();
  kb.text('🗑 Удалённые: ' + (db.deletedProducts || []).length, 'admin:deleted')
    .text('↩️ Вернуть всё', 'admin:restoreall').row();
  kb.text('🏠 Меню', 'admin:home');
  return kb;
}

function productKeyboard(id) {
  const p = findProduct(id);
  if (!p) return new InlineKeyboard().text('🏠 Меню', 'admin:home');
  const kb = new InlineKeyboard()
    .text('💵 Цена (AED)', `admin:setprice:${id}`).text('💲 Цена (USD)', `admin:setpriceusd:${id}`).row()
    .text('📝 Название RU', `admin:setname:${id}`).text('📝 Название EN', `admin:setnameen:${id}`).row()
    .text('📄 Описание RU', `admin:setdesc:${id}`).text('📄 Описание EN', `admin:setdescen:${id}`).row()
    .text('📐 Объём, мл', `admin:setvolume:${id}`).text(p.outOfStock ? '✅ В наличии' : '🚫 Нет в наличии', `admin:stock:${id}`).row()
    .text('🖼 Фото', `admin:setphoto:${id}`)
    .text(p.hidden ? '👁 Показать' : '🙈 Скрыть', `admin:hide:${id}`).row()
    .text(p.isHit ? '🔥 Хит ✓' : '🔥 Хит', `admin:hit:${id}`)
    .text(p.isNew ? '🆕 Новинка ✓' : '🆕 Новинка', `admin:new:${id}`).row()
    .text(p.custom ? '🗑 Удалить навсегда' : '🗑 Удалить', `admin:del:${id}`).row()
    .text('⬅️ Каталог', 'admin:catalog:0').text('🏠 Меню', 'admin:home');
  return kb;
}

function productText(p) {
  const info = localizeProduct(p, 'ru');
  const price = info.price === null
    ? 'по запросу'
    : `${moneyAed(info.price)}${info.priceUsd ? ` · ≈ $${info.priceUsd}` : ''}`;
  return [
    `🍸 <b>${esc(info.name)}</b>`,
    info.nameEn && info.nameEn !== info.name ? `<i>${esc(info.nameEn)}</i>` : '',
    '',
    `Артикул: <b>${esc(info.article)}</b> · ID: <code>${esc(info.id)}</code>`,
    `Коллекция: ${esc(info.collectionLabel)}`,
    `Цена: <b>${price}</b> · за штуку`,
    `Объём: ${esc(info.volumeLabel || '—')}`,
    `Статус: ${p.hidden ? '🙈 скрыт' : p.outOfStock ? '🚫 нет в наличии' : '✅ в наличии'}${p.isHit ? ' · 🔥 хит' : ''}${p.isNew ? ' · 🆕 новинка' : ''}`,
    p.custom ? '✨ добавлен вручную' : '',
    '',
    esc(info.description || '').slice(0, 500),
  ].filter(Boolean).join('\n');
}

function shopKeyboard() {
  return new InlineKeyboard()
    .text('🏷 Название', 'admin:shop:name').text('✍️ Слоган RU', 'admin:shop:tagline:ru').row()
    .text('✍️ Слоган EN', 'admin:shop:tagline:en').text('📖 О бренде RU', 'admin:shop:about:ru').row()
    .text('📖 О бренде EN', 'admin:shop:about:en').row()
    .text('📞 Телефон', 'admin:shop:phone').text('✉️ E-mail', 'admin:shop:email').row()
    .text('📷 Instagram', 'admin:shop:instagram').text('💬 WhatsApp', 'admin:shop:whatsapp').row()
    .text('📍 Адрес шоурума', 'admin:shop:address').row()
    .text('🚚 Текст доставки RU', 'admin:shop:deliverynote:ru').text('🚚 EN', 'admin:shop:deliverynote:en').row()
    .text('💵 Бесплатная доставка от', 'admin:shop:freeFrom').text('🚚 Стоимость', 'admin:shop:cost').row()
    .text('🏦 Реквизиты для инвойса', 'admin:seller').row()
    .text('🏠 Меню', 'admin:home');
}

function shopText() {
  const info = getShopInfo();
  const brand = info.brand;
  return [
    '🏪 <b>Магазин и контакты</b>',
    '',
    `Название: <b>${esc(brand.name)}</b>`,
    `Слоган RU: ${esc(brand.tagline?.ru || '—')}`,
    `Слоган EN: ${esc(brand.tagline?.en || '—')}`,
    `Телефон: ${esc(brand.phone || '—')}`,
    `E-mail: ${esc(brand.email || '—')}`,
    `Instagram: ${brand.instagram ? `@${esc(brand.instagram)}` : '—'}`,
    `WhatsApp: ${esc(brand.whatsapp || '—')}`,
    `Адрес: ${esc(brand.address || '—')}`,
    '',
    `Доставка: бесплатно от ${moneyAed(info.shop.freeShippingFrom)}, иначе ${moneyAed(info.shop.shippingCost)}`,
    `Порог мелкого опта: от ${info.shop.wholesaleFrom} шт.`,
  ].join('\n');
}

function sellerKeyboard() {
  const map = [
    ['legalName', 'Юр. название'], ['trn', 'TRN (VAT)'], ['licence', 'Лицензия'], ['address', 'Адрес'],
    ['bankName', 'Банк'], ['accountName', 'Получатель'], ['iban', 'IBAN'], ['swift', 'SWIFT'],
    ['accountNumber', 'Расчётный счёт'], ['phone', 'Телефон'], ['email', 'E-mail'],
  ];
  const kb = new InlineKeyboard();
  map.forEach(([key, label], i) => {
    kb.text(label, `admin:seller:${key}`);
    if (i % 2 === 1) kb.row();
  });
  if (map.length % 2) kb.row();
  kb.text('⬅️ Магазин', 'admin:shop').text('🏠 Меню', 'admin:home');
  return kb;
}

function sellerText() {
  const s = getShopInfo().seller;
  return ['🏦 <b>Реквизиты для инвойсов</b>', '', sellerLines('ru'), '', 'Нажмите поле, чтобы изменить.'].join('\n');
}

async function startFlow(ctx, type, question, payload = null) {
  setFlow(ctx.from.id, { type, payload });
  await ctx.reply(question, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}

export function registerAdminHandlers(bot, { notifyAdmins }) {
  const guard = async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(t('admin.access', 'ru'));
      return false;
    }
    return true;
  };

  bot.command('admin', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.reply(homeText(), { parse_mode: 'HTML', reply_markup: adminMenu() });
  });

  bot.callbackQuery('admin:noop', (ctx) => ctx.answerCallbackQuery());

  // ─── вход в панель ───────────────────────────────────────────
  bot.callbackQuery('admin:home', async (ctx) => {
    if (!(await guard(ctx))) return;
    clearFlow(ctx.from.id);
    await ctx.answerCallbackQuery();
    await show(ctx, homeText(), adminMenu());
  });

  // ─── заказы ──────────────────────────────────────────────────
  bot.callbackQuery(/^admin:orders:(all|active|paid|invoice|search)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const filter = ctx.match[1];
    if (filter === 'search') {
      await startFlow(ctx, 'orderSearch', '🔍 Введите номер заказа, например <b>CE-1001</b>.');
      return;
    }
    await show(ctx, ordersText(filter), ordersKeyboard(filter));
  });

  bot.callbackQuery(/^admin:order:([0-9a-f-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const order = getOrder(ctx.match[1]);
    if (!order) return show(ctx, 'Заказ не найден.', adminMenu());
    await show(ctx, adminOrderCaption(order, 'ru'), orderKeyboard(order));
  });

  bot.callbackQuery(/^admin:setstatus:([0-9a-f-]+):([a-z_]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const [, id, status] = ctx.match;
    const order = getOrder(id);
    if (!order) return ctx.answerCallbackQuery({ text: 'Заказ не найден' });
    setStatus(order, status, 'admin');
    await ctx.answerCallbackQuery({ text: `Статус: ${tv(ORDER_STATUSES[status].title, 'ru')}` });
    // клиенту — уведомление в чат и в поддержку
    const locale = order.locale || 'ru';
    try {
      await bot.api.sendMessage(order.userId, t('bot.orderStatus', locale, {
        number: order.number, status: t(`status.${status}`, locale),
      }));
    } catch {}
    await show(ctx, adminOrderCaption(order, 'ru'), orderKeyboard(order));
  });

  bot.callbackQuery(/^admin:markpaid:([0-9a-f-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const order = getOrder(ctx.match[1]);
    if (order) markPaid(order, { provider: 'manual' }, 'admin');
    await ctx.answerCallbackQuery({ text: 'Оплата отмечена' });
    if (order) {
      const locale = order.locale || 'ru';
      try {
        await bot.api.sendMessage(order.userId, t('order.paid', locale));
      } catch {}
      await show(ctx, adminOrderCaption(order, 'ru'), orderKeyboard(order));
    }
  });

  bot.callbackQuery(/^admin:unpaid:([0-9a-f-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const order = getOrder(ctx.match[1]);
    if (order) updateOrder(order.id, { paymentStatus: 'pending', status: 'awaiting_payment' }, 'admin');
    await ctx.answerCallbackQuery({ text: 'Оплата снята' });
    if (order) await show(ctx, adminOrderCaption(order, 'ru'), orderKeyboard(order));
  });

  bot.callbackQuery(/^admin:user:(-?\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const user = getUser(ctx.match[1]);
    if (!user) return show(ctx, 'Пользователь не найден.', adminMenu());
    const orders = db.orders.filter((o) => o.userId === Number(ctx.match[1]));
    const text = [
      `👤 <b>${esc(userTitle(user.id))}</b>`,
      '',
      `ID: <code>${user.id}</code>${user.username ? ` · @${esc(user.username)}` : ''}`,
      `Заказов: ${orders.length} · на сумму ${moneyAed(orders.reduce((s, o) => s + (o.paymentStatus === 'paid' ? o.total : 0), 0))}`,
      `Язык: ${isLocale(user.lang) ? user.lang : 'по умолчанию'}`,
      `Первый визит: ${new Date(user.createdAt).toLocaleString('ru-RU')}`,
    ].join('\n');
    await show(ctx, text, new InlineKeyboard().text('💬 Написать', `admin:writeuser:${user.id}`).row().text('🏠 Меню', 'admin:home'));
  });

  bot.callbackQuery(/^admin:writeuser:(-?\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'writeUser', '✍️ Напишите текст — отправлю клиенту в личку.', ctx.match[1]);
  });

  // ─── поддержка ───────────────────────────────────────────────
  bot.callbackQuery('admin:support', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const threads = listThreads();
    if (!threads.length) return show(ctx, 'Обращений пока нет.', adminMenu());
    const kb = new InlineKeyboard();
    threads.slice(0, 8).forEach((th) => {
      kb.text(`${th.unreadAdmin ? '🔴 ' : ''}${th.title.slice(0, 30)}`, `admin:thread:${th.userId}`).row();
    });
    kb.text('🏠 Меню', 'admin:home');
    const text = `💬 <b>Обращения</b> (${threads.length}, новых: ${supportStats().unread})\n\n${threads.slice(0, 8)
      .map((th) => `• ${esc(th.title)} — ${esc((th.lastMessage?.text || '').slice(0, 60))}`).join('\n')}`;
    await show(ctx, text, kb);
  });

  bot.callbackQuery(/^admin:thread:(-?\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const userId = Number(ctx.match[1]);
    markAdminRead(userId);
    await ctx.answerCallbackQuery();
    const thread = getThread(userId, false);
    const messages = (thread?.messages || []).slice(-10);
    const kb = new InlineKeyboard()
      .text('✍️ Ответить', `admin:reply:${userId}`).row()
      .text('⬅️ К списку', 'admin:support').text('🏠 Меню', 'admin:home');
    const text = `💬 <b>${esc(userTitle(userId))}</b>\n\n${messages
      .map((m) => `${m.from === 'user' ? '👤' : m.from === 'admin' ? '🧑‍💼' : '⚙️'} ${esc(m.text).slice(0, 300)}`)
      .join('\n') || '—'}`;
    await show(ctx, text, kb);
  });

  bot.callbackQuery(/^admin:reply:(-?\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'replyUser', '✍️ Напишите ответ — отправлю клиенту.', ctx.match[1]);
  });

  // ─── каталог ─────────────────────────────────────────────────
  bot.callbackQuery(/^admin:catalog:(\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const page = Number(ctx.match[1]);
    const stats = catalogStats();
    const text = [
      '🍸 <b>Каталог</b>',
      '',
      `Всего: ${stats.total} · видно: ${stats.visible} · скрыто: ${stats.hidden}`,
      `Нет в наличии: ${stats.outOfStock} · правок: ${stats.edited} · своих: ${stats.custom}`,
    ].join('\n');
    await show(ctx, text, catalogKeyboard(page));
  });

  bot.callbackQuery(/^admin:prod:([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const p = findProduct(ctx.match[1]);
    if (!p) return show(ctx, 'Позиция не найдена.', adminMenu());
    await show(ctx, productText(p), productKeyboard(p.id));
  });

  bot.callbackQuery(/^admin:(stock|hide|hit|new|del):([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const [, action, id] = ctx.match;
    const p = findProduct(id);
    if (!p) return ctx.answerCallbackQuery({ text: 'Позиция не найдена' });
    if (action === 'del') {
      try {
        deleteProduct(id);
        await ctx.answerCallbackQuery({ text: 'Позиция удалена' });
        return show(ctx, '🗑 Позиция удалена. Вернуть можно кнопкой «Удалённые».', catalogKeyboard(0));
      } catch (err) {
        return ctx.answerCallbackQuery({ text: err.message });
      }
    }
    const patch = {};
    if (action === 'stock') patch.outOfStock = !p.outOfStock;
    if (action === 'hide') patch.hidden = !p.hidden;
    if (action === 'hit') patch.isHit = !p.isHit;
    if (action === 'new') patch.isNew = !p.isNew;
    updateProduct(id, patch);
    await ctx.answerCallbackQuery({ text: 'Ок' });
    const updated = findProduct(id);
    await show(ctx, productText(updated), productKeyboard(updated.id));
  });

  bot.callbackQuery('admin:deleted', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const deleted = (db.deletedProducts || []).map((id) => findProduct(id) || { id, name: { ru: id, en: id }, article: id });
    if (!deleted.length) return show(ctx, 'Удалённых позиций нет.', adminMenu());
    const kb = new InlineKeyboard();
    deleted.slice(0, 8).forEach((p) => kb.text(`↩️ ${localizeProduct(p, 'ru').name.slice(0, 28)}`, `admin:restore:${p.id}`).row());
    kb.text('↩️ Вернуть всё', 'admin:restoreall').row().text('🏠 Меню', 'admin:home');
    await show(ctx, `🗑 <b>Удалённые</b> (${deleted.length})`, kb);
  });

  bot.callbackQuery(/^admin:restore:([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    restoreProduct(ctx.match[1]);
    await ctx.answerCallbackQuery({ text: 'Возвращено' });
    const p = findProduct(ctx.match[1]);
    await show(ctx, p ? productText(p) : 'Готово.', p ? productKeyboard(p.id) : adminMenu());
  });

  bot.callbackQuery('admin:restoreall', async (ctx) => {
    if (!(await guard(ctx))) return;
    const res = restoreBaseCatalog();
    await ctx.answerCallbackQuery({ text: `Возвращено ${res.restored}` });
    await show(ctx, `↩️ Возвращено позиций: ${res.restored}, снято скрытие: ${res.unhidden}.\nВитрина: ${res.visible} поз.`,
      adminMenu());
  });

  bot.callbackQuery('admin:addprod', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const cats = rawCategories();
    if (!cats.length) return show(ctx, 'Сначала создайте коллекцию.', adminMenu());
    const kb = new InlineKeyboard();
    cats.slice(0, 10).forEach((c) => kb.text(c.title, `admin:addprod:cat:${c.id}`).row());
    kb.text('🏠 Меню', 'admin:home');
    await show(ctx, '➕ <b>Новая позиция</b>\n\nШаг 1/4 — выберите коллекцию.', kb);
  });

  bot.callbackQuery(/^admin:addprod:cat:([a-z0-9-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    setFlow(ctx.from.id, { type: 'addProduct', step: 'name', payload: { category: ctx.match[1] } });
    await ctx.reply('Шаг 2/4 — отправьте название позиции (можно через «/»: <b>Русское / English</b>).', { parse_mode: 'HTML' });
  });

  // ─── коллекции ───────────────────────────────────────────────
  bot.callbackQuery('admin:cats', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const cats = rawCategories();
    const kb = new InlineKeyboard();
    cats.forEach((c) => kb.text(`${c.title} · ${c.count}`, `admin:cat:${c.id}`).row());
    kb.text('➕ Новая коллекция', 'admin:catadd').row().text('🏠 Меню', 'admin:home');
    await show(ctx, `🗂 <b>Коллекции</b> (${cats.length})`, kb);
  });

  bot.callbackQuery(/^admin:cat:([a-z0-9-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const id = ctx.match[1];
    const cat = rawCategories().find((c) => c.id === id);
    if (!cat) return show(ctx, 'Коллекция не найдена.', adminMenu());
    const kb = new InlineKeyboard()
      .text('✏️ Переименовать RU', `admin:catren:${id}:ru`).text('✏️ EN', `admin:catren:${id}:en`).row()
      .text('🗑 Удалить', `admin:catdel:${id}`).row()
      .text('⬅️ Коллекции', 'admin:cats').text('🏠 Меню', 'admin:home');
    const products = allProducts().filter((p) => p.category === id);
    await show(ctx, [
      `🗂 <b>${esc(cat.title)}</b>`,
      `ID: <code>${esc(id)}</code> · позиций: ${products.length}`,
      '',
      products.slice(0, 6).map((p) => `• ${esc(localizeProduct(p, 'ru').name)}`).join('\n') || '—',
    ].join('\n'), kb);
  });

  bot.callbackQuery('admin:catadd', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'catAdd', '➕ Отправьте название новой коллекции (можно <b>Русское / English</b>).');
  });

  bot.callbackQuery(/^admin:catren:([a-z0-9-]+):(ru|en)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'catRename', `✏️ Новое название (${ctx.match[2]}):`, { id: ctx.match[1], lang: ctx.match[2] });
  });

  bot.callbackQuery(/^admin:catdel:([a-z0-9-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    try {
      deleteCategory(ctx.match[1]);
      await ctx.answerCallbackQuery({ text: 'Коллекция удалена' });
      await show(ctx, '🗑 Коллекция удалена.', adminMenu());
    } catch (err) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
    }
  });

  // ─── магазин, реквизиты ──────────────────────────────────────
  bot.callbackQuery('admin:shop', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await show(ctx, shopText(), shopKeyboard());
  });

  bot.callbackQuery(/^admin:shop:([a-zA-Z]+)(?::(ru|en))?$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const field = ctx.match[1];
    const lang = ctx.match[2] || null;
    const prompts = {
      name: '🏷 Новое название магазина:',
      tagline: '✍️ Новый слоган:',
      about: '📖 Текст «О бренде»:',
      phone: '📞 Телефон:',
      email: '✉️ E-mail:',
      instagram: '📷 Instagram (без @):',
      whatsapp: '💬 WhatsApp (в формате +971…):',
      address: '📍 Адрес шоурума и склада:',
      deliverynote: '🚚 Текст о доставке:',
      freeFrom: '💵 Бесплатная доставка от суммы (AED):',
      cost: '🚚 Стоимость доставки (AED):',
    };
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'shopField', prompts[field] || 'Новое значение:', { field, lang });
  });

  bot.callbackQuery('admin:seller', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await show(ctx, sellerText(), sellerKeyboard());
  });

  bot.callbackQuery(/^admin:seller:([a-zA-Z]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'sellerField', `🏦 Новое значение «${ctx.match[1]}»:`, { field: ctx.match[1] });
  });

  // ─── статистика, рассылка, настройки ─────────────────────────
  bot.callbackQuery('admin:stats', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const s = orderStats();
    const c = catalogStats();
    const support = supportStats();
    const top = [...db.orders]
      .flatMap((o) => o.items.map((it) => ({ name: it.name, qty: it.qty })))
      .reduce((acc, item) => {
        const found = acc.find((x) => x.name === item.name);
        if (found) found.qty += item.qty;
        else acc.push({ ...item });
        return acc;
      }, [])
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    const text = [
      '📊 <b>Статистика</b>',
      '',
      `Заказов: ${s.total} · за сутки: ${s.today} · за неделю: ${s.week}`,
      `Оплачено: ${s.paidCount} · выручка: ${moneyAed(s.revenue)} · средний чек: ${moneyAed(s.avgCheck)}`,
      `Открытых: ${s.open} · пользователей: ${s.users}`,
      '',
      `Каталог: ${c.visible} витрина / ${c.total} всего · коллекций: ${c.categories}`,
      `Поддержка: ${support.threads} диалогов, новых: ${support.unread}`,
      '',
      top.length ? `<b>Топ позиций:</b>\n${top.map((x) => `• ${esc(x.name)} — ${x.qty} шт.`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
    await show(ctx, text, adminMenu());
  });

  bot.callbackQuery('admin:broadcast', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const users = Object.values(db.users).filter((u) => !u.isGuest).length;
    const kb = new InlineKeyboard()
      .text('✍️ Написать текст', 'admin:broadcast:text').row()
      .text('🏠 Меню', 'admin:home');
    await show(ctx, `📣 <b>Рассылка</b>\n\nПолучателей в Telegram: ${users}. Отправка — по кнопке после ввода текста.`, kb);
  });

  bot.callbackQuery('admin:broadcast:text', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await startFlow(ctx, 'broadcast', '📣 Отправьте текст рассылки (HTML можно).');
  });

  bot.callbackQuery('admin:settings', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const text = [
      '⚙️ <b>Настройки и интеграции</b>',
      '',
      `Бот: ${config.telegram.hasBot ? `✅ @${config.telegram.username || '—'}` : '❌ BOT_TOKEN не задан'}`,
      `Админов в доступе: ${config.telegram.adminIds.length}`,
      `Адрес приложения: ${config.publicUrl || '— не задан (PUBLIC_URL/DOMAIN)'}`,
      `Язык по умолчанию: ${config.defaultLocale}`,
      `Валюта: ${config.shop.currency} · курс USD: ${config.shop.usdRate}`,
      `VAT: ${config.seller.vatRate}% ${config.seller.vatIncluded ? '(включён в цену)' : '(сверху)'}`,
      `Инвойсы: ${config.seller.iban ? '✅ реквизиты заданы' : '❌ задайте SELLER_IBAN'}`,
      `Карты онлайн: ${config.payments.yookassa.enabled ? 'ЮKassa ✅' : config.payments.link ? 'ссылка ✅' : 'вручную (менеджер)'}`,
      `Портов открыто: ${config.webPorts.join(', ')}`,
      '',
      `Каталог: ${catalogStats().visible} позиций, коллекций ${catalogStats().categories}`,
      `Проверка витрины: ${catalogHealth().broken ? '⚠️ пустая витрина' : 'ок'}`,
    ].join('\n');
    await show(ctx, text, adminMenu());
  });

  // ─── ввод текста для активных сценариев ──────────────────────
  bot.on('message:text', async (ctx, next) => {
    if (!isAdmin(ctx.from?.id)) return next();
    const flow = getFlow(ctx.from.id);
    if (!flow) return next();
    const text = ctx.message.text.trim();
    if (text === '/cancel' || text === '/admin') {
      clearFlow(ctx.from.id);
      await ctx.reply('Отменено.', { reply_markup: adminMenu() });
      return;
    }
    clearFlow(ctx.from.id);

    try {
      switch (flow.type) {
        case 'orderSearch': {
          const order = getOrderByNumber(text) || getOrder(text);
          if (!order) {
            await ctx.reply('Заказ не найден.', { reply_markup: ordersKeyboard('all') });
            return;
          }
          await ctx.reply(adminOrderCaption(order, 'ru'), { parse_mode: 'HTML', reply_markup: orderKeyboard(order) });
          return;
        }
        case 'writeUser':
        case 'replyUser': {
          const userId = Number(flow.payload);
          const message = addAdminMessage(userId, text, { name: 'Cocktail Embassy' });
          await ctx.reply('✅ Отправлено клиенту.');
          try {
            await bot.api.sendMessage(userId, `${t('bot.supportReply', getUser(userId)?.lang || 'ru')}\n\n${esc(text)}`, { parse_mode: 'HTML' });
          } catch {}
          void message;
          return;
        }
        case 'catAdd': {
          const [ru, en] = text.includes('/') ? text.split('/').map((s) => s.trim()) : [text, text];
          const category = createCategory({ title: { ru, en: en || ru } });
          await ctx.reply(`✅ Коллекция «${category.title}» создана.`, { reply_markup: adminMenu() });
          return;
        }
        case 'catRename': {
          const { id, lang } = flow.payload;
          const current = rawCategories().find((c) => c.id === id);
          const title = { ...(typeof current?.title === 'object' ? current.title : { ru: current?.title || '', en: current?.title || '' }) };
          title[lang] = text;
          updateCategory(id, { title });
          await ctx.reply('✅ Название обновлено.', { reply_markup: adminMenu() });
          return;
        }
        case 'shopField': {
          const { field, lang } = flow.payload;
          if (['freeFrom', 'cost'].includes(field)) {
            const value = Math.max(0, Math.round(Number(text.replace(/[^\d.]/g, '')) || 0));
            updateShopInfo({ shop: { [field === 'freeFrom' ? 'freeShippingFrom' : 'shippingCost']: value } });
          } else if (field === 'deliverynote') {
            updateShopInfo({ delivery: { note: { [lang || 'ru']: text } } });
          } else if (['tagline', 'about'].includes(field)) {
            updateShopInfo({ brand: { [field]: { [lang || 'ru']: text } } });
          } else {
            updateShopInfo({ brand: { [field]: text } });
          }
          await ctx.reply('✅ Сохранено.', { reply_markup: adminMenu() });
          return;
        }
        case 'sellerField': {
          updateShopInfo({ seller: { [flow.payload.field]: text } });
          await ctx.reply('✅ Реквизиты обновлены.', { reply_markup: adminMenu() });
          return;
        }
        case 'broadcast': {
          const users = Object.values(db.users).filter((u) => !u.isGuest);
          let sent = 0;
          await ctx.reply(`📣 Отправляю ${users.length} получателям…`);
          for (const user of users) {
            try {
              await bot.api.sendMessage(user.id, text, { parse_mode: 'HTML' });
              sent += 1;
            } catch {}
            await new Promise((r) => setTimeout(r, 60));
          }
          await ctx.reply(`✅ Доставлено: ${sent} из ${users.length}.`, { reply_markup: adminMenu() });
          return;
        }
        case 'addProduct': {
          const payload = flow.payload || {};
          if (flow.step === 'name') {
            const [ru, en] = text.includes('/') ? text.split('/').map((s) => s.trim()) : [text, text];
            setFlow(ctx.from.id, { type: 'addProduct', step: 'price', payload: { ...payload, name: { ru, en: en || ru } } });
            await ctx.reply('Шаг 3/4 — цена в AED (или «по запросу»):');
            return;
          }
          if (flow.step === 'price') {
            setFlow(ctx.from.id, { type: 'addProduct', step: 'volume', payload: { ...payload, price: text } });
            await ctx.reply('Шаг 4/4 — объём в мл (или «—»):');
            return;
          }
          if (flow.step === 'volume') {
            const volume = Number.parseInt(text, 10);
            const product = createProduct({
              name: payload.name,
              category: payload.category,
              price: payload.price,
              volumeMl: Number.isFinite(volume) ? volume : null,
            });
            await ctx.reply(`✅ Позиция «${localizeProduct(product, 'ru').name}» создана (${product.article}).`,
              { reply_markup: productKeyboard(product.id) });
            return;
          }
          return;
        }
        case 'productField': {
          const { field, id } = flow.payload;
          if (field === 'price' || field === 'priceusd') {
            updateProduct(id, { [field]: text });
          } else if (field === 'volume') {
            const value = Number.parseInt(text, 10);
            updateProduct(id, { volumeMl: Number.isFinite(value) ? value : null });
          } else if (field === 'desc') {
            updateProduct(id, { description: { ru: text } });
          } else if (field === 'descen') {
            updateProduct(id, { descriptionEn: text });
          } else if (field === 'name') {
            updateProduct(id, { name: text });
          } else if (field === 'nameen') {
            updateProduct(id, { nameEn: text });
          }
          const updated = findProduct(id);
          await ctx.reply('✅ Сохранено.', { reply_markup: productKeyboard(id) });
          if (updated) await ctx.reply(productText(updated), { parse_mode: 'HTML', reply_markup: productKeyboard(id) });
          return;
        }
        default:
          await ctx.reply('Сценарий сброшен.', { reply_markup: adminMenu() });
      }
    } catch (err) {
      console.error('[admin]', err);
      await ctx.reply(`⚠️ ${err.message}`, { reply_markup: adminMenu() });
    }
  });

  // фото для позиции
  bot.on('message:photo', async (ctx, next) => {
    if (!isAdmin(ctx.from?.id)) return next();
    const flow = getFlow(ctx.from.id);
    if (!flow || flow.type !== 'photo' && flow.type !== 'addProductPhoto') return next();
    clearFlow(ctx.from.id);
    const id = flow.payload?.id;
    try {
      const photos = ctx.message.photo;
      const file = await ctx.api.getFile(photos[photos.length - 1].file_id);
      const url = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;
      const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
      const saved = saveProductPhoto(id, buffer, file.file_path?.endsWith('.png') ? 'png' : 'jpg');
      updateProduct(id, { image: saved });
      await ctx.reply('🖼 Фото обновлено.', { reply_markup: productKeyboard(id) });
    } catch (err) {
      await ctx.reply(`⚠️ Не удалось сохранить фото: ${err.message}`);
    }
  });

  // сценарии, зависящие от позиции
  bot.callbackQuery(/^admin:(setprice|setpriceusd|setname|setnameen|setdesc|setdescen|setvolume|setphoto):([A-Za-z0-9_-]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const [, action, id] = ctx.match;
    await ctx.answerCallbackQuery();
    const prompts = {
      setprice: '💵 Новая цена в AED (число или «по запросу»):',
      setpriceusd: '💲 Новая справочная цена в USD (число):',
      setname: '📝 Новое название на русском:',
      setnameen: '📝 Новое название на английском:',
      setdesc: '📄 Новое описание на русском:',
      setdescen: '📄 Новое описание на английском:',
      setvolume: '📐 Объём в мл (число или «—»):',
      setphoto: '🖼 Отправьте фото позиции одним сообщением.',
    };
    if (action === 'setphoto') {
      setFlow(ctx.from.id, { type: 'photo', payload: { id } });
      await ctx.reply(prompts.setphoto);
      return;
    }
    const field = action.replace('set', '');
    setFlow(ctx.from.id, { type: 'productField', payload: { field, id } });
    await ctx.reply(prompts[action]);
  });

  void paymentMethods;
  void parsePhotoDataUrl;
  void InputFile;
  void setOverride;
  void searchProducts;
  void deleteCategory;
}
