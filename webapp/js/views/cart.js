/** Корзина: количество, прогресс до бесплатной доставки, итоги. */
import { h, tap, money, emptyState, confirmDialog, t, toast } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, refresh } from '../router.js';
import { tg } from '../tg.js';
import { locale } from '../i18n.js';
import { state, cartDetailed, cartSubtotal, shippingFor, clearCart, setQty } from '../state.js';
import { qtyStepper, trustBadges } from '../components.js';

export default function cartView() {
  const items = cartDetailed();
  const tgMode = tg.inTelegram;

  if (!items.length) {
    return {
      title: t('cart.title'),
      tab: 'cart',
      content: h('div', { style: { paddingTop: '30px' } },
        emptyState({
          emoji: '🛒',
          title: t('cart.empty'),
          text: t('cart.emptyHint'),
          action: tap(h('button.btn', { style: { width: 'auto', padding: '0 22px', marginTop: '10px' } }, t('cart.toCatalog')),
            () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' })),
        })),
    };
  }

  const draftMethod = state.draft.delivery.method;
  const subtotal = cartSubtotal();
  const shipping = shippingFor(subtotal, draftMethod);
  const total = subtotal + shipping;
  const freeFrom = state.config?.delivery?.freeFrom || 0;
  const left = Math.max(0, freeFrom - subtotal);

  const checkout = () => navigate('checkout');

  const progress = freeFrom > 0
    ? h('.progress', { style: { marginTop: '14px' } },
      h('.progress-text', left > 0
        ? t('cart.freeFrom', { amount: money(left) })
        : t('cart.freeReached')),
      h('.progress-bar', h('.progress-fill', { style: { width: `${Math.min(100, (subtotal / freeFrom) * 100)}%` } })))
    : null;

  const content = h('div',
    h('div', { style: { paddingTop: '14px' } },
      h('.group', ...items.map((it) => h('.cart-item',
        h('.cart-thumb', it.image ? h('img', { src: it.image, alt: '' }) : null),
        h('.cart-body',
          h('.cart-name', it.name),
          h('.cart-sub', `${it.volumeLabel && it.volumeLabel !== '—' ? `${it.volumeLabel} · ` : ''}${t('common.article')} ${it.article}`),
          h('.cart-row',
            qtyStepper(it.id, it.qty, (next) => {
              if (next === 0) {
                toast(`${it.name} — ${locale.current === 'en' ? 'removed' : 'удалено'}`);
                refresh();
                return;
              }
              refresh();
            }),
            h('span.cart-price', money(it.sum)))))))),
    progress,
    h('div', { style: { marginTop: '16px' } },
      h('.group',
        h('.summary-row', h('span', t('cart.goods')), h('span.mono', money(subtotal))),
        h('.summary-row', h('span', t('cart.shipping')),
          shipping ? h('span.mono', money(shipping)) : h('span.free', t('cart.free'))),
        h('.summary-row.total', h('span', t('cart.total')), h('span.mono', money(total))))),
    h('div', { style: { padding: '18px 16px 6px' } },
      tap(h('button.btn', `${t('cart.checkout')} · ${money(total)}`), checkout)),
    h('div', { style: { padding: '0 16px 12px' } },
      tap(h('button.btn.danger', t('cart.clear')), async () => {
        const ok = await confirmDialog({ title: t('cart.clear'), message: t('cart.clearConfirm'), okText: t('cart.clearOk'), destructive: true });
        if (ok) {
          clearCart();
          refresh();
        }
      })),
    h('div', { style: { padding: '6px 16px 12px' } }, trustBadges()),
  );

  return {
    title: t('cart.title'),
    tab: 'cart',
    content,
    onMount: () => {
      if (tgMode) tg.mainButton({ text: `${t('cart.checkout')} · ${money(total)}`, onClick: checkout });
    },
    onDestroy: () => tg.hideMainButton(),
  };
}

export { setQty };
