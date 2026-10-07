/**
 * Telegram-бот Cocktail Embassy: витрина в чате, поддержка, уведомления
 * администраторам и админ-панель. Язык интерфейса — на пользователя (ru/en).
 */
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, isAdmin } from '../config.js';
import { db, save, upsertUser, getUser, userTitle } from '../store.js';
import { events } from '../events.js';
import { t, tv, DEFAULT_LOCALE, isLocale } from '../i18n.js';
import {
  getCategories, publicProducts, findProduct, getBrand, getTexts, getDeliveryInfo,
  localizeProduct, searchProducts,
} from '../catalog.js';
import { addAdminMessage, addUserMessage, getThread, markAdminRead } from '../support.js';
import { getOrder, markPaid, setStatus } from '../orders.js';
import { adminMenu, registerAdminHandlers } from './admin.js';
import { esc, moneyAed, productCaption, statusTitle } from './format.js';

export const bot = config.telegram.hasBot
  ? new Bot(config.telegram.token, { client: { canUseWebhookReply: false } })
  : null;

/** Язык пользователя (сохраняется в профиле). */
export function userLocale(userId) {
  const user = getUser(userId);
  const lang = user?.lang;
  if (isLocale(lang)) return String(lang).slice(0, 2);
  return config.defaultLocale === 'en' ? 'en' : 'ru';
}

function setUserLocale(userId, locale) {
  const user = getUser(userId) || upsertUser({ id: userId });
  user.lang = locale;
  save();
}

const miniAppUrl = () => (config.publicUrl ? config.publicUrl : null);

function shopKeyboard(locale) {
  const kb = new InlineKeyboard();
  const url = miniAppUrl();
  if (url) kb.webApp(t('bot.openApp', locale), url);
  kb.row();
  kb.text(t('bot.catalog', locale), 'shop:catalog').row();
  kb.text(t('bot.delivery', locale), 'shop:delivery')
    .text(t('bot.support', locale), 'shop:support').row();
  kb.text(t('bot.language', locale), 'shop:lang');
  return kb;
}

function catalogKeyboard(locale, page = 0) {
  const kb = new InlineKeyboard();
  const categories = getCategories(locale);
  categories.forEach((c, i) => {
    const count = publicProducts().filter((p) => p.category === c.id).length;
    kb.text(`${c.emoji ? `${c.emoji} ` : ''}${c.title} · ${count}`, `cat:${c.id}:0`);
    if (i % 2 === 1) kb.row();
  });
  if (categories.length % 2) kb.row();
  kb.text('⬅️', `catpage:${Math.max(0, page - 1)}`).text('➡️', `catpage:${page + 1}`);
  void locale;
  return kb;
}

function collectionKeyboard(locale, categoryId, page = 0, pageSize = 6) {
  const kb = new InlineKeyboard();
  const list = publicProducts().filter((p) => p.category === categoryId);
  const slice = list.slice(page * pageSize, page * pageSize + pageSize);
  slice.forEach((p, i) => {
    const info = localizeProduct(p, locale);
    const price = info.price === null ? t('product.ask', locale) : moneyAed(info.price);
    kb.text(`${info.name} — ${price}`, `prod:${p.id}`);
    if (i % 2 === 1) kb.row();
  });
  if (slice.length % 2) kb.row();
  const pages = Math.ceil(list.length / pageSize);
  if (pages > 1) {
    if (page > 0) kb.text('⬅️', `cat:${categoryId}:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, 'noop');
    if (page + 1 < pages) kb.text('➡️', `cat:${categoryId}:${page + 1}`);
    kb.row();
  }
  kb.text(t('bot.backToCollections', locale), 'shop:catalog');
  return kb;
}

function productKeyboard(locale, product) {
  const kb = new InlineKeyboard();
  const info = localizeProduct(product, locale);
  const url = miniAppUrl();
  if (url) kb.webApp(t('bot.openApp', locale), `${url}/?product=${info.article}&lang=${locale}`).row();
  kb.text(`📄 ${t('product.ask', locale)}`, `ask:${info.article}`).row();
  kb.text(t('bot.backToCollections', locale), `cat:${info.category}:0`);
  return kb;
}

async function editOrSend(ctx, text, keyboard) {
  const options = { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } };
  try {
    await ctx.editMessageText(text, options);
  } catch {
    await ctx.reply(text, options);
  }
}

function welcomeText(locale, name) {
  return `${t('bot.welcome', locale, { name: esc(name || '') })}\n\n${t('bot.welcomeBody', locale)}`;
}

const COMMANDS = [
  { command: 'start', description: 'Магазин / Shop' },
  { command: 'catalog', description: 'Каталог / Catalogue' },
  { command: 'delivery', description: 'Доставка и оплата / Delivery & payment' },
  { command: 'language', description: 'Язык / Language' },
  { command: 'help', description: 'Помощь / Help' },
];

/** Регистрация всех обработчиков (без обращения к сети — удобно тестировать). */
export function registerHandlers() {
  if (!bot) return false;

  bot.catch((err) => console.error('[bot]', err?.message || err));

  bot.command('start', async (ctx) => {
    const user = upsertUser(ctx.from);
    const locale = userLocale(ctx.from.id);
    const payload = ctx.match || '';
    if (payload.startsWith('order_')) {
      const order = getOrder(payload.slice(6));
      if (order && order.userId === Number(ctx.from.id)) {
        await ctx.reply(adminOrderText(order, locale), {
          parse_mode: 'HTML',
          reply_markup: shopKeyboard(locale),
          link_preview_options: { is_disabled: true },
        });
        return;
      }
    }
    const url = miniAppUrl();
    if (url) {
      const kb = new InlineKeyboard().webApp(t('bot.openApp', locale), url).row()
        .text(t('bot.catalog', locale), 'shop:catalog')
        .text(t('bot.language', locale), 'shop:lang');
      await ctx.reply(welcomeText(locale, ctx.from.first_name), {
        parse_mode: 'HTML',
        reply_markup: kb,
        link_preview_options: { is_disabled: true },
      });
      return;
    }
    await ctx.reply(welcomeText(locale, ctx.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: shopKeyboard(locale),
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('catalog', async (ctx) => {
    upsertUser(ctx.from);
    const locale = userLocale(ctx.from.id);
    const products = publicProducts();
    const categories = getCategories(locale);
    const text = `<b>${t('bot.pickCollection', locale)}</b>\n\n${categories
      .map((c) => `${c.emoji ? `${c.emoji} ` : ''}${esc(c.title)} — ${products.filter((p) => p.category === c.id).length}`)
      .join('\n')}`;
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: catalogKeyboard(locale) });
  });

  bot.command('delivery', async (ctx) => {
    upsertUser(ctx.from);
    const locale = userLocale(ctx.from.id);
    await ctx.reply(getTexts(locale).delivery, {
      parse_mode: 'HTML',
      reply_markup: shopKeyboard(locale),
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('language', async (ctx) => {
    upsertUser(ctx.from);
    const locale = userLocale(ctx.from.id);
    await ctx.reply(t('bot.pickLanguage', locale), {
      reply_markup: new InlineKeyboard().text('🇷🇺 Русский', 'lang:ru').text('🇬🇧 English', 'lang:en'),
    });
  });

  bot.command('help', async (ctx) => {
    const locale = userLocale(ctx.from.id);
    const brand = getBrand(locale);
    const text = [
      `<b>${esc(brand.name)}</b>`,
      esc(brand.tagline),
      '',
      `${t('profile.phone', locale)}: ${esc(brand.phone)}`,
      `${t('profile.email', locale)}: ${esc(brand.email)}`,
      brand.instagram ? `Instagram: @${esc(brand.instagram)}` : '',
      '',
      t('bot.askQuestion', locale),
    ].filter(Boolean).join('\n');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: shopKeyboard(locale), link_preview_options: { is_disabled: true } });
  });

  // кнопки
  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());
  bot.callbackQuery(/^shop:(catalog|delivery|support|lang)$/, async (ctx) => {
    const action = ctx.match[1];
    const locale = userLocale(ctx.from.id);
    await ctx.answerCallbackQuery();
    if (action === 'catalog') {
      const categories = getCategories(locale);
      const text = `<b>${t('bot.pickCollection', locale)}</b>\n\n${categories
        .map((c) => `${c.emoji ? `${c.emoji} ` : ''}${esc(c.title)} — ${publicProducts().filter((p) => p.category === c.id).length}`)
        .join('\n')}`;
      await editOrSend(ctx, text, catalogKeyboard(locale));
    } else if (action === 'delivery') {
      await editOrSend(ctx, getTexts(locale).delivery, shopKeyboard(locale));
    } else if (action === 'support') {
      await editOrSend(ctx, t('bot.askQuestion', locale), shopKeyboard(locale));
    } else {
      await editOrSend(ctx, t('bot.pickLanguage', locale),
        new InlineKeyboard().text('🇷🇺 Русский', 'lang:ru').text('🇬🇧 English', 'lang:en'));
    }
  });

  bot.callbackQuery(/^lang:(ru|en)$/, async (ctx) => {
    const locale = ctx.match[1];
    setUserLocale(ctx.from.id, locale);
    await ctx.answerCallbackQuery({ text: t('bot.languageSet', locale) });
    await editOrSend(ctx, welcomeText(locale, ctx.from.first_name), shopKeyboard(locale));
  });

  bot.callbackQuery(/^cat:([a-z0-9-]+):(\d+)$/, async (ctx) => {
    const [, categoryId, page] = ctx.match;
    const locale = userLocale(ctx.from.id);
    await ctx.answerCallbackQuery();
    const category = getCategories(locale).find((c) => c.id === categoryId);
    if (!category) return;
    await editOrSend(ctx,
      `<b>${esc(category.title)}</b>\n${esc(category.subtitle || '')}`,
      collectionKeyboard(locale, categoryId, Number(page)));
  });

  bot.callbackQuery(/^catpage:(\d+)$/, async (ctx) => {
    const locale = userLocale(ctx.from.id);
    await ctx.answerCallbackQuery();
    await editOrSend(ctx, `<b>${t('bot.pickCollection', locale)}</b>`, catalogKeyboard(locale, Number(ctx.match[1])));
  });

  bot.callbackQuery(/^prod:([A-Za-z0-9_-]+)$/, async (ctx) => {
    const locale = userLocale(ctx.from.id);
    const product = findProduct(ctx.match[1]);
    await ctx.answerCallbackQuery();
    if (!product) return;
    const caption = productCaption(product, locale);
    if (product.image) {
      const filePath = `${config.root}/webapp/${product.image}`;
      try {
        await ctx.replyWithPhoto(new InputFile(filePath), {
          caption,
          parse_mode: 'HTML',
          reply_markup: productKeyboard(locale, product),
        });
        return;
      } catch (err) {
        console.warn('[bot] не удалось отправить фото:', err.message);
      }
    }
    await editOrSend(ctx, caption, productKeyboard(locale, product));
  });

  bot.callbackQuery(/^ask:([A-Za-z0-9_-]+)$/, async (ctx) => {
    const locale = userLocale(ctx.from.id);
    const product = findProduct(ctx.match[1]);
    await ctx.answerCallbackQuery();
    if (!product) return;
    const info = localizeProduct(product, locale);
    const text = locale === 'en'
      ? `Tell us about <b>${esc(info.name)}</b> (${esc(info.article)}) — quantity, city and timeline. Our team will reply here.`
      : `Расскажите про <b>${esc(info.name)}</b> (${esc(info.article)}) — количество, город и сроки. Менеджер ответит здесь.`;
    const user = getUser(ctx.from.id) || upsertUser(ctx.from);
    user.pendingAsk = info.article;
    save();
    await editOrSend(ctx, text, new InlineKeyboard().text(t('bot.backToCollections', locale), `cat:${info.category}:0`));
  });


  // ─── уведомления администраторам ─────────────────────────────
  const adminIds = config.telegram.adminIds;
  const notifyAdmins = async (text, keyboard) => {
    for (const id of adminIds) {
      try {
        await bot.api.sendMessage(id, text, {
          parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        console.warn(`[bot] не удалось уведомить админа ${id}:`, err.message);
      }
    }
  };

  // админ-панель регистрируется раньше общего обработчика текста,
  // чтобы ввод в сценариях админки не уходил в поддержку
  registerAdminHandlers(bot, { notifyAdmins });

  // ─── произвольные сообщения — в поддержку ────────────────────
  bot.on('message:text', async (ctx) => {
    const locale = userLocale(ctx.from.id);
    const user = upsertUser(ctx.from);
    const pending = user.pendingAsk;
    user.pendingAsk = null;
    save();
    const text = pending ? `[${pending}] ${ctx.message.text}` : ctx.message.text;
    addUserMessage({ ...ctx.from }, text, { locale });
    await ctx.reply(t('bot.questionSent', locale), { reply_markup: shopKeyboard(locale) });
  });

  events.on('order:created', (order) => {
    const kb = new InlineKeyboard().text('📦 Открыть заказ', `admin:order:${order.id}`);
    notifyAdmins(`🆕 <b>Новый заказ</b>\n\n${adminOrderText(order, 'ru')}`, kb);
  });

  events.on('order:paid', (order) => {
    notifyAdmins(`✅ <b>Оплачен заказ ${esc(order.number)}</b> · ${moneyAed(order.total)}`,
      new InlineKeyboard().text('📦 Открыть', `admin:order:${order.id}`));
  });

  events.on('support:user-message', ({ userId, message }) => {
    notifyAdmins(`💬 <b>${esc(userTitle(userId))}</b>\n${esc(message.text)}`,
      new InlineKeyboard().text('💬 Ответить', `admin:thread:${userId}`));
  });

  return true;
}

export async function startBot() {
  if (!bot) {
    console.warn('[bot] BOT_TOKEN не задан — бот не запущен (витрина работает)');
    return null;
  }
  registerHandlers();

  await bot.api.setMyCommands(COMMANDS).catch(() => {});

  // ─── запуск ──────────────────────────────────────────────────
  await bot.api.setChatMenuButton({
    menu_button: {
      type: miniAppUrl() ? 'web_app' : 'commands',
      ...(miniAppUrl() ? { text: 'Магазин', web_app: { url: miniAppUrl() } } : {}),
    },
  }).catch((err) => console.warn('[bot] setChatMenuButton:', err.message));

  if (config.telegram.mode === 'webhook' && config.publicUrl) {
    const url = `${config.publicUrl}/telegram/webhook`;
    await bot.api.setWebhook(url, { secret_token: config.telegram.webhookSecret || undefined });
    console.log(`[bot] вебхук установлен: ${url}`);
  } else {
    await bot.start({
      onStart: (info) => console.log(`[bot] @${info.username} на связи (long polling)`),
      drop_pending_updates: false,
    });
  }
  return bot;
}

function adminOrderText(order, locale) {
  const rows = [
    `<b>${esc(order.number)}</b> · ${moneyAed(order.total)}`,
    statusTitle(order.status, locale),
    '',
  ];
  for (const it of order.items) rows.push(`• ${esc(it.name)} × ${it.qty}`);
  rows.push('', `${esc(order.customer.name)}, ${esc(order.customer.phone)}`);
  if (order.company) rows.push(esc(order.company.name));
  if (order.comment) rows.push(`💬 ${esc(order.comment)}`);
  return rows.join('\n');
}

export { adminMenu, DEFAULT_LOCALE, tv, addAdminMessage, markAdminRead, markPaid, setStatus };
