/** Список заказов пользователя. */
import { h, tap, money, emptyState, dateShort, timeShort, spinnerBlock, t } from '../ui.js';
import { navigate } from '../router.js';
import { api } from '../api.js';
import { locale } from '../i18n.js';
import { state, updateOrdersCache } from '../state.js';

export function statusChip(order) {
  const meta = state.config?.statuses?.[order.status] || { title: order.status, emoji: '' };
  return h('span.status-chip', { class: order.status }, `${meta.emoji} ${meta.title}`.trim());
}

export function orderCard(order) {
  const card = h('.order-card',
    h('.order-head',
      h('.order-num', order.number),
      statusChip(order)),
    h('.tiny.muted', { style: { marginTop: '3px' } },
      `${dateShort(order.createdAt)}, ${timeShort(order.createdAt)} · ${order.items.length} ${locale.current === 'en' ? 'items' : 'поз.'}`),
    h('.order-thumbs', ...order.items.slice(0, 5).map((it) =>
      h('.cart-thumb', it.image ? h('img', { src: it.image, alt: '', loading: 'lazy' }) : null))),
    h('.order-foot',
      h('span', order.paymentMethod === 'invoice' ? t('orders.invoice') : t('orders.card')),
      h('span', { style: { color: 'var(--label)', fontWeight: '600' } }, money(order.total))),
  );
  tap(card, () => navigate('order', { id: order.id }));
  return card;
}

export default function ordersView() {
  const list = h('div', spinnerBlock(t('orders.loading')));

  async function load() {
    try {
      const res = await api.orders();
      updateOrdersCache(res.orders);
      list.innerHTML = '';
      if (!res.orders.length) {
        list.append(emptyState({
          emoji: '📦',
          title: t('orders.empty'),
          text: t('orders.emptyHint'),
          action: tap(h('button.btn', { style: { width: 'auto', padding: '0 22px', marginTop: '8px' } }, t('cart.toCatalog')),
            () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' })),
        }));
        return;
      }
      list.append(h('div', { style: { paddingTop: '14px' } }, ...res.orders.map(orderCard)));
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState({ emoji: '⚠️', title: t('orders.failed'), text: err.message }));
    }
  }

  return {
    title: t('orders.title'),
    tabbar: false,
    content: list,
    onMount: load,
  };
}
