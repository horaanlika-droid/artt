/** Доставка и оплата: условия, сроки, способы оплаты. */
import { h, section, money, t } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../state.js';

export default function deliveryView() {
  const cfg = state.config?.delivery || {};
  const note = cfg.note || '';

  const content = h('div', { style: { paddingTop: '10px' } },
    h('.group',
      ...(cfg.methods || []).map((m) => h('.cell',
        h('.cell-icon', { html: icon('truck', 18) }),
        h('.cell-body',
          h('.cell-title', m.title),
          h('.cell-sub', m.quote
            ? t('delivery.exportNote')
            : m.free
              ? t('cart.free')
              : t('delivery.freeFrom', { amount: money(cfg.freeFrom), cost: money(cfg.cost) })))))),

    section(t('checkout.payment'),
      h('.group',
        ...(state.config?.payments || []).map((p) => h('.cell',
          h('.cell-icon', { html: icon(p.id === 'invoice' ? 'receipt' : 'card', 18) }),
          h('.cell-body',
            h('.cell-title', p.title),
            h('.cell-sub', p.enabled ? p.subtitle : p.hint)))))),

    note ? section('', h('.group',
      h('.cell', { style: { display: 'block', padding: '14px' } },
        h('div', { style: { fontSize: '14.5px', lineHeight: '1.5', color: 'var(--label-2)' } }, note)))) : null,

    h('.section-footer', { style: { padding: '14px 20px 30px' } },
      `${state.config?.brand?.city || 'Dubai'} · ${state.config?.brand?.address || ''}`),
  );

  return { title: t('delivery.title'), tabbar: false, content };
}
