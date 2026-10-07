/** Детали заказа: статус, состав, оплата и инвойс. */
import { h, tap, money, section, toast, spinnerBlock, dateShort, timeShort, confirmDialog, appendAll, t } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { statusChip } from './orders.js';

const FLOW = ['new', 'paid', 'packing', 'shipped', 'done'];

export default function orderView({ id, justCreated, awaitingPayment }) {
  const box = h('div', spinnerBlock(t('order.loading')));
  let poll = null;

  async function render() {
    let data;
    try {
      data = await api.order(id);
    } catch {
      box.innerHTML = '';
      box.append(h('.empty', h('h3', t('order.notFound'))));
      return;
    }
    const { order, invoice } = data || {};
    if (!order) {
      // например, ссылка устарела или заказ недоступен гостю
      box.innerHTML = '';
      box.append(h('.empty', h('h3', t('order.notFound'))));
      return;
    }
    const statusMeta = state.config?.statuses || {};
    const currentIndex = FLOW.indexOf(order.status);

    const timeline = order.status === 'canceled'
      ? h('ul.timeline', h('li.done', t('status.canceled')))
      : h('ul.timeline', ...FLOW.map((st, i) =>
        h('li', { class: i <= currentIndex ? 'done' : '' },
          `${statusMeta[st]?.emoji || ''} ${statusMeta[st]?.title || st}`)));

    const actions = [];

    if (order.paymentMethod === 'card' && order.paymentStatus !== 'paid' && order.status !== 'canceled') {
      actions.push(tap(h('button.btn', t('order.checkPayment')), async () => {
        const res = await api.checkOrder(order.id);
        if (res.paid) {
          tg.haptic('success');
          toast(t('order.paid'));
          render();
        } else {
          tg.haptic('warning');
          toast(t('order.notPaid'));
        }
      }));
    }

    if (invoice) {
      actions.push(tap(h('button.btn', h('span', { html: icon('receipt', 18) }), h('span', t('order.openInvoice'))), () => {
        const url = invoice.url?.startsWith('http') ? invoice.url : `${location.origin}/invoice/${order.id}?k=${order.invoiceKey || ''}&lang=${state.config?.locale || ''}`;
        tg.openLink(url);
      }));
    }

    if (!['done', 'canceled'].includes(order.status) && order.paymentStatus !== 'paid') {
      actions.push(tap(h('button.btn.danger', t('order.cancel')), async () => {
        const ok = await confirmDialog({ title: t('order.cancelConfirm'), message: order.number, okText: t('order.cancel'), destructive: true });
        if (!ok) return;
        await api.cancelOrder(order.id);
        toast(t('order.canceled'));
        render();
      }));
    }

    actions.push(tap(h('button.btn.secondary', h('span', { html: icon('chat', 18) }), h('span', t('order.support'))),
      () => navigate('support', { prefill: t('support.orderContext', { number: order.number }) })));

    box.innerHTML = '';
    appendAll(box,
      justCreated
        ? h('.notice', order.paymentMethod === 'invoice'
          ? t('order.justCreatedInvoice', { number: order.invoiceNumber })
          : t('order.justCreated'))
        : null,
      awaitingPayment ? h('.notice', t('order.awaitingNotice')) : null,

      h('div', { style: { padding: '18px 16px 0' } },
        h('.hstack', h('h1', { style: { margin: 0, fontSize: '26px', letterSpacing: '-0.6px' } }, order.number), h('.spacer'), statusChip(order)),
        h('.tiny.muted', { style: { marginTop: '4px' } },
          t('order.createdAt', { date: dateShort(order.createdAt), time: timeShort(order.createdAt) }))),

      section(t('order.status'), h('.group', h('.cell', { style: { display: 'block', padding: '14px' } }, timeline))),

      section(t('order.items'),
        h('.group',
          ...order.items.map((it) => h('.cart-item',
            h('.cart-thumb', it.image ? h('img', { src: it.image, alt: '' }) : null),
            h('.cart-body',
              h('.cart-name', it.name),
              h('.cart-sub', `${it.volumeLabel && it.volumeLabel !== '—' ? `${it.volumeLabel} · ` : ''}${t('common.article')} ${it.article}`),
              h('.cart-row', h('span.tiny.muted', `${it.qty} × ${money(it.price)}`), h('span.cart-price', money(it.price * it.qty)))))),
          h('.summary-row', h('span', t('cart.goods')), h('span.mono', money(order.subtotal))),
          h('.summary-row', h('span', t('cart.shipping')), order.shipping ? h('span.mono', money(order.shipping)) : h('span.free', t('cart.free'))),
          h('.summary-row.total', h('span', t('order.total')), h('span.mono', money(order.total))))),

      section(t('order.payment'),
        h('.group',
          h('.cell', h('.cell-icon', { html: icon(order.paymentMethod === 'invoice' ? 'receipt' : 'card', 18) }),
            h('.cell-body',
              h('.cell-title', order.paymentMethod === 'invoice' ? t('order.pay.requisites') : t('order.pay.card')),
              h('.cell-sub', order.paymentStatus === 'paid' ? t('order.paidShort')
                : order.paymentStatus === 'canceled' ? t('order.canceledPayment')
                : t('order.awaitingPayment')))),
          invoice ? h('.cell', h('.cell-body', h('.cell-title', t('order.invoiceNumber'))), h('.cell-value', invoice.number)) : null,
          invoice?.seller?.configured
            ? h('.cell', { style: { display: 'block', padding: '12px 14px' } },
              h('.tiny.muted', { style: { lineHeight: '1.5' } },
                `${invoice.seller.legalName || ''}\n${t('invoice.trn')} ${invoice.seller.trn || '—'}\n${invoice.seller.bankName || ''}\n${t('invoice.iban')} ${invoice.seller.iban || '—'}`))
            : null)),

      section(t('order.shipping'),
        h('.group',
          h('.cell', h('.cell-body', h('.cell-title', order.delivery.methodTitle),
            h('.cell-sub', [order.delivery.city, order.delivery.address].filter(Boolean).join(', ') || t('product.askHint')))),
          h('.cell', h('.cell-body', h('.cell-title', t('order.recipient')), h('.cell-sub', `${order.customer.name} · ${order.customer.phone}`))),
          order.company ? h('.cell', h('.cell-body', h('.cell-title', order.company.name), h('.cell-sub', `${t('invoice.trn')} ${order.company.trn || order.company.vat || '—'}`))) : null)),

      order.comment ? section(t('order.comment'), h('.group', h('.cell', h('.cell-body', h('.cell-sub', order.comment))))) : null,

      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px 16px 30px' } }, ...actions),
    );

    if (order.paymentMethod === 'card' && order.paymentStatus !== 'paid' && order.status !== 'canceled') {
      clearInterval(poll);
      let attempts = 0;
      poll = setInterval(async () => {
        attempts += 1;
        if (attempts > 40) return clearInterval(poll);
        try {
          const res = await api.checkOrder(order.id);
          if (res.paid) {
            clearInterval(poll);
            tg.haptic('success');
            toast(t('order.paid'));
            render();
          }
        } catch {}
      }, 6000);
    }
  }

  return {
    title: t('order.title'),
    tabbar: false,
    content: box,
    onMount: render,
    onDestroy: () => clearInterval(poll),
  };
}
