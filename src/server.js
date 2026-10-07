/**
 * HTTP-сервер: раздаёт витрину и обслуживает API.
 * Язык (ru/en) определяется по ?lang, cookie, языку Telegram или Accept-Language.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { config, paymentMethods, ROOT } from './config.js';
import { db, save, upsertUser, getUser } from './store.js';
import { validateInitData } from './lib/telegram-auth.js';
import {
  publicProductList, publicProducts, allProducts, findProduct, getCategories,
  getBrand, getDeliveryInfo, getShopSettings, getTexts, getSeller, catalogStats,
} from './catalog.js';
import {
  createOrder, getOrder, userOrders, updateOrder, markPaid,
  normalizeItems, computeTotals, deliveryMethods, localizedStatuses,
} from './orders.js';
import { addUserMessage, getThread, markUserRead } from './support.js';
import { renderInvoiceHtml, invoiceSummary } from './payments/invoice.js';
import { localeFromRequest, dictionary, DEFAULT_LOCALE } from './i18n.js';
import * as yookassa from './payments/yookassa.js';

const WEBAPP_DIR = path.join(ROOT, 'webapp');

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '8mb' }));

  // ─── авторизация ─────────────────────────────────────────────
  const GUEST_COOKIE = 'ce_guest';
  const LANG_COOKIE = 'ce_lang';
  const GUEST_COOKIE_MAX_AGE = 365 * 24 * 3600 * 1000;

  function guestSecret() {
    if (!db.settings.guestSecret) {
      db.settings.guestSecret = crypto.randomBytes(24).toString('hex');
      save();
    }
    return db.settings.guestSecret;
  }

  const signGuestId = (id) => crypto.createHmac('sha256', guestSecret()).update(`guest:${id}`).digest('base64url');

  function readGuestCookie(req) {
    for (const part of (req.get('cookie') || '').split(';')) {
      const i = part.indexOf('=');
      if (i === -1 || part.slice(0, i).trim() !== GUEST_COOKIE) continue;
      const m = part.slice(i + 1).trim().match(/^(-?\d+)\.([A-Za-z0-9_-]{1,64})$/);
      if (!m) return 0;
      const id = Number(m[1]);
      const sig = Buffer.from(m[2]);
      const calc = Buffer.from(signGuestId(id));
      if (sig.length === calc.length && crypto.timingSafeEqual(sig, calc)) return id;
      return 0;
    }
    return 0;
  }

  function authenticate(req, res, next) {
    // язык запроса — доступен и в API, и в статике
    const queryLang = String(req.query?.lang || '').slice(0, 2).toLowerCase();
    req.locale = localeFromRequest(req);
    if (queryLang === 'ru' || queryLang === 'en') {
      res.cookie(LANG_COOKIE, req.locale, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: GUEST_COOKIE_MAX_AGE });
    }

    const initData = req.get('X-Telegram-Init-Data') || '';
    if (initData && config.telegram.token) {
      const result = validateInitData(initData, config.telegram.token);
      if (result.ok) {
        req.user = upsertUser(result.user);
        req.viaTelegram = true;
        // язык интерфейса Telegram — подсказка для витрины
        if (result.user?.language_code && !queryLang) {
          const tgLang = String(result.user.language_code).slice(0, 2).toLowerCase();
          if (tgLang === 'ru' || tgLang === 'en') req.locale = tgLang;
        }
        return next();
      }
      console.warn(`[auth] initData отклонено (${result.reason}) — продолжаем как гость`);
    }

    let guestId = readGuestCookie(req);
    if (!guestId || !getUser(guestId)) {
      do {
        guestId = -crypto.randomInt(1_000_000, 2_000_000_000);
      } while (db.users[String(guestId)]);
      res.cookie(GUEST_COOKIE, `${guestId}.${signGuestId(guestId)}`, {
        httpOnly: true, sameSite: 'lax', path: '/', maxAge: GUEST_COOKIE_MAX_AGE, secure: req.secure,
      });
    }
    req.user = upsertUser({ id: guestId, first_name: 'Guest', isGuest: true });
    req.guest = true;
    next();
  }

  const api = express.Router();
  api.use(authenticate);

  const wrap = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[api]', err);
      if (!res.headersSent) res.status(400).json({ error: err.message || 'error' });
    });
  };

  // ─── конфигурация витрины ─────────────────────────────────────
  api.get('/config', wrap((req, res) => {
    const locale = req.locale;
    const shop = getShopSettings();
    res.json({
      locale,
      locales: ['ru', 'en'],
      i18n: dictionary(locale),
      brand: getBrand(locale),
      delivery: {
        ...getDeliveryInfo(locale),
        methods: deliveryMethods(locale),
        freeFrom: shop.freeShippingFrom,
        cost: shop.shippingCost,
      },
      shop,
      currencies: { base: shop.currency, reference: 'USD', usdRate: shop.usdRate },
      texts: getTexts(locale),
      payments: paymentMethods(locale),
      statuses: localizedStatuses(locale),
      user: req.user,
      guest: Boolean(req.guest),
      botUsername: config.telegram.username,
      supportEnabled: config.telegram.hasBot,
    });
  }));

  api.get('/catalog', wrap((req, res) => {
    res.json({
      categories: getCategories(req.locale),
      products: publicProductList(req.locale),
    });
  }));

  // ─── избранное ────────────────────────────────────────────────
  api.get('/favorites', wrap((req, res) => {
    res.json({ ids: db.favorites[String(req.user.id)] || [] });
  }));

  api.post('/favorites/:id', wrap((req, res) => {
    const key = String(req.user.id);
    const list = new Set(db.favorites[key] || []);
    const id = req.params.id;
    if (!findProduct(id)) throw new Error('Product not found');
    if (list.has(id)) list.delete(id);
    else list.add(id);
    db.favorites[key] = [...list];
    save();
    res.json({ ids: db.favorites[key] });
  }));

  // ─── корзина ──────────────────────────────────────────────────
  api.get('/cart', wrap((req, res) => {
    res.json({ items: db.carts[String(req.user.id)] || [] });
  }));

  api.put('/cart', wrap((req, res) => {
    const items = (req.body?.items || [])
      .filter((it) => findProduct(it.id))
      .map((it) => ({ id: String(it.id), qty: Math.max(1, Math.min(999, Number(it.qty) || 1)) }));
    db.carts[String(req.user.id)] = items;
    save();
    res.json({ items });
  }));

  api.post('/cart/quote', wrap((req, res) => {
    const items = normalizeItems(req.body?.items, req.locale);
    res.json({ items, ...computeTotals(items, req.body?.deliveryMethod) });
  }));

  // ─── заказы ───────────────────────────────────────────────────
  api.get('/orders', wrap((req, res) => {
    res.json({ orders: userOrders(req.user.id) });
  }));

  api.get('/orders/:id', wrap((req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'not-found' });
    res.json({ order, invoice: order.invoiceNumber ? invoiceSummary(order) : null });
  }));

  api.post('/orders', wrap(async (req, res) => {
    const body = req.body || {};
    const method = body.paymentMethod;
    const available = paymentMethods(req.locale).filter((m) => m.enabled).map((m) => m.id);
    const en = req.locale === 'en';
    if (!available.includes(method)) throw new Error(en ? 'Payment method is unavailable' : 'Способ оплаты недоступен');
    if (!body.customer?.name || !body.customer?.phone) throw new Error(en ? 'Name and phone are required' : 'Укажите имя и телефон');
    if (method === 'invoice' && !body.company?.name) {
      throw new Error(en ? 'Company name is required for an invoice' : 'Для инвойса нужно название компании');
    }

    const order = createOrder({
      userId: req.user.id,
      items: body.items,
      customer: body.customer,
      delivery: body.delivery,
      paymentMethod: method,
      company: body.company,
      comment: body.comment,
      locale: req.locale,
    });

    db.carts[String(req.user.id)] = [];
    save();

    const payload = { order };

    if (method === 'card' && yookassa.enabled) {
      const returnUrl = req.viaTelegram && config.telegram.username
        ? `https://t.me/${config.telegram.username}?startapp=order_${order.id}`
        : `${config.publicUrl || ''}/?order=${order.id}`;
      try {
        const payment = await yookassa.createPayment(order, { returnUrl });
        updateOrder(order.id, { payment: { provider: 'yookassa', id: payment.id }, paymentStatus: 'pending' });
        payload.confirmationUrl = payment.confirmationUrl;
      } catch (err) {
        updateOrder(order.id, { paymentError: err.message });
        throw err;
      }
    }

    if (method === 'card' && config.payments.link) {
      payload.confirmationUrl = config.payments.link;
      updateOrder(order.id, { payment: { provider: 'link' }, paymentStatus: 'pending' });
    }

    if (method === 'invoice') payload.invoice = invoiceSummary(order);

    res.json(payload);
  }));

  api.post('/orders/:id/check', wrap(async (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'not-found' });
    if (order.paymentStatus === 'paid') return res.json({ order, paid: true });

    if (order.paymentMethod === 'card' && order.payment?.provider === 'yookassa' && order.payment?.id) {
      const payment = await yookassa.getPayment(order.payment.id);
      if (payment.paid || payment.status === 'succeeded') {
        markPaid(order, { provider: 'yookassa', id: payment.id, method: payment.method }, 'yookassa');
        return res.json({ order, paid: true });
      }
      if (payment.status === 'canceled') {
        updateOrder(order.id, { paymentStatus: 'canceled', status: 'canceled' });
        return res.json({ order, paid: false, canceled: true });
      }
    }
    res.json({ order, paid: false });
  }));

  api.post('/orders/:id/cancel', wrap((req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'not-found' });
    if (order.paymentStatus === 'paid') {
      throw new Error(req.locale === 'en'
        ? 'A paid order is canceled by our team — please message support'
        : 'Оплаченный заказ отменяет менеджер — напишите в поддержку');
    }
    updateOrder(order.id, { status: 'canceled', paymentStatus: 'canceled' }, 'user');
    res.json({ order });
  }));

  // ─── поддержка ────────────────────────────────────────────────
  api.get('/support', wrap((req, res) => {
    const thread = getThread(req.user.id);
    markUserRead(req.user.id);
    res.json({ messages: thread.messages, status: thread.status, online: config.telegram.hasBot });
  }));

  api.post('/support', wrap((req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) throw new Error(req.locale === 'en' ? 'Empty message' : 'Пустое сообщение');
    const message = addUserMessage(req.user, text, req.body?.context ? { context: req.body.context } : {});
    res.json({ message });
  }));

  api.get('/support/updates', wrap((req, res) => {
    const since = Number(req.query.since || 0);
    const thread = getThread(req.user.id, false);
    const messages = (thread?.messages || []).filter((m) => m.at > since);
    if (messages.length) markUserRead(req.user.id);
    res.json({ messages, now: Date.now() });
  }));

  app.use('/api', api);

  // ─── вебхук оплаты (если подключена ЮKassa) ───────────────────
  app.post('/webhook/yookassa', express.json(), async (req, res) => {
    res.status(200).end();
    try {
      const event = req.body;
      const paymentId = event?.object?.id;
      const orderId = event?.object?.metadata?.orderId;
      if (!paymentId || !orderId) return;
      const order = getOrder(orderId);
      if (!order) return;
      const payment = await yookassa.getPayment(paymentId);
      if (payment.paid || payment.status === 'succeeded') {
        markPaid(order, { provider: 'yookassa', id: paymentId, method: payment.method }, 'yookassa');
      } else if (payment.status === 'canceled') {
        updateOrder(order.id, { paymentStatus: 'canceled' }, 'yookassa');
      }
    } catch (err) {
      console.error('[yookassa webhook]', err.message);
    }
  });

  // ─── печатная форма инвойса ───────────────────────────────────
  app.get('/invoice/:id', (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || !order.invoiceNumber) return res.status(404).send('Invoice not found');
    if (order.invoiceKey && req.query.k !== order.invoiceKey) return res.status(403).send('Forbidden');
    if (req.query.lang === 'ru' || req.query.lang === 'en') order.locale = req.query.lang;
    res.type('html').send(renderInvoiceHtml(order));
  });

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      brand: config.brandName,
      bot: config.telegram.hasBot,
      locale: req.locale || DEFAULT_LOCALE,
      orders: db.orders.length,
      catalog: catalogStats(),
      seller: Boolean(getSeller().configured),
      uptime: process.uptime(),
    });
  });

  // ─── статика витрины ──────────────────────────────────────────
  app.use(express.static(WEBAPP_DIR, {
    etag: true,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not-found' });
    res.sendFile(path.join(WEBAPP_DIR, 'index.html'));
  });

  return app;
}

/** Поднять приложение сразу на нескольких портах (см. config.webPorts). */
export function startServer() {
  const app = createServer();

  const listen = (port) => new Promise((resolve, reject) => {
    const server = app.listen(port, config.host);
    server.once('listening', () => resolve(server));
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') return resolve(null);
      reject(err);
    });
  });

  return (async () => {
    const bound = [];
    let lastError = null;
    for (const port of config.webPorts) {
      try {
        const server = await listen(port);
        if (server) bound.push(server.address().port);
        else console.warn(`[web] порт ${port} уже занят другим процессом — пропускаю`);
      } catch (err) {
        lastError = err;
        console.error(`[web] не удалось слушать порт ${port}:`, err.message);
      }
    }
    if (!bound.length) throw lastError || new Error(`веб-сервер не поднялся ни на одном порте из ${config.webPorts.join(', ')}`);
    console.log(`[web] ${config.brandName} · витрина на ${bound.map((p) => `http://${config.host}:${p}`).join(', ')}`);
    if (config.publicUrl) console.log(`[web] адрес приложения (PUBLIC_URL/DOMAIN): ${config.publicUrl}`);
    return app;
  })();
}

export { allProducts, publicProducts };
