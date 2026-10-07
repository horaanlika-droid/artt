/** HTTP-клиент к API магазина. Язык передаётся в каждом запросе. */
import { tg } from './tg.js';
import { locale } from './i18n.js';

const base = '/api';

async function request(path, { method = 'GET', body, query } = {}) {
  const url = new URL(base + path, location.origin);
  url.searchParams.set('lang', locale.current);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  if (tg.initData) headers['X-Telegram-Init-Data'] = tg.initData;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export const api = {
  config: () => request('/config'),
  catalog: () => request('/catalog'),

  favorites: () => request('/favorites'),
  toggleFavorite: (id) => request(`/favorites/${id}`, { method: 'POST' }),

  cart: () => request('/cart'),
  saveCart: (items) => request('/cart', { method: 'PUT', body: { items } }),
  quote: (items, deliveryMethod) => request('/cart/quote', { method: 'POST', body: { items, deliveryMethod } }),

  orders: () => request('/orders'),
  order: (id) => request(`/orders/${id}`),
  createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
  checkOrder: (id) => request(`/orders/${id}/check`, { method: 'POST' }),
  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),

  support: () => request('/support'),
  sendSupport: (text, context) => request('/support', { method: 'POST', body: { text, context } }),
  supportUpdates: (since) => request('/support/updates', { query: { since } }),
};
