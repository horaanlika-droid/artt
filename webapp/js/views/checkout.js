/** Оформление: контакты, доставка, оплата (инвойс на компанию / карта онлайн). */
import { h, tap, money, section, field, toast, t } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { state, cartDetailed, cartSubtotal, shippingFor, saveDraft, clearCart } from '../state.js';

const PAY_ICONS = { invoice: 'receipt', card: 'card' };

export default function checkoutView() {
  const items = cartDetailed();
  if (!items.length) {
    setTimeout(() => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' }), 0);
    return { title: t('checkout.title'), content: h('div') };
  }

  const draft = state.draft;
  const methods = state.config?.delivery?.methods || [];
  const payments = (state.config?.payments || []).filter((p) => p.enabled || p.id === 'invoice');
  if (!draft.payment || !payments.some((p) => p.id === draft.payment)) {
    draft.payment = payments.find((p) => p.enabled)?.id || 'invoice';
  }

  const subtotalEl = h('span.mono');
  const shippingEl = h('span.mono');
  const totalEl = h('span.mono');
  let total = 0;

  const payBtn = h('button.btn');

  const payLabel = () => (draft.payment === 'invoice'
    ? `${t('checkout.placeInvoice')} · ${money(total)}`
    : `${t('checkout.pay')} · ${money(total)}`);

  function recalc() {
    const subtotal = cartSubtotal();
    const shipping = shippingFor(subtotal, draft.delivery.method);
    total = subtotal + shipping;
    subtotalEl.textContent = money(subtotal);
    shippingEl.textContent = shipping ? money(shipping) : t('cart.free');
    shippingEl.className = shipping ? 'mono' : 'free';
    totalEl.textContent = money(total);
    if (tg.inTelegram) tg.mainButton({ text: payLabel(), onClick: submit });
    if (payBtn) payBtn.textContent = payLabel();
  }

  // ── контакты ───────────────────────────────────────────────
  const nameField = field({
    label: t('checkout.name'), placeholder: t('checkout.namePlaceholder'), value: draft.customer.name,
    onInput: (v) => { draft.customer.name = v; saveDraft({}); },
  });
  const phoneField = field({
    label: t('checkout.phone'), placeholder: '+971 50 000 0000', type: 'tel', inputmode: 'tel', value: draft.customer.phone,
    onInput: (v) => { draft.customer.phone = v; saveDraft({}); },
  });
  const emailField = field({
    label: t('checkout.email'), placeholder: t('checkout.emailPlaceholder'), type: 'email', inputmode: 'email', value: draft.customer.email,
    onInput: (v) => { draft.customer.email = v; saveDraft({}); },
  });

  // ── доставка ───────────────────────────────────────────────
  const cityField = field({
    label: t('checkout.city'), placeholder: t('checkout.cityPlaceholder'), value: draft.delivery.city,
    onInput: (v) => { draft.delivery.city = v; saveDraft({}); },
  });
  const addressField = field({
    label: t('checkout.address'), placeholder: t('checkout.addressPlaceholder'), value: draft.delivery.address,
    onInput: (v) => { draft.delivery.address = v; saveDraft({}); },
  });

  const deliveryCells = methods.map((m) => {
    const radio = h('.radio', { class: draft.delivery.method === m.id ? 'on' : '' });
    const sub = m.quote
      ? t('delivery.exportNote')
      : m.free
        ? t('cart.free')
        : t('delivery.freeFrom', { amount: money(state.config.delivery.freeFrom), cost: money(state.config.delivery.cost) });
    const cell = h('.cell.tappable',
      h('.cell-body', h('.cell-title', m.title), h('.cell-sub', sub)),
      radio);
    tap(cell, () => {
      draft.delivery.method = m.id;
      saveDraft({});
      for (const [i, c] of deliveryCells.entries()) {
        c.querySelector('.radio').classList.toggle('on', methods[i].id === m.id);
      }
      recalc();
    }, 'select');
    return cell;
  });

  // ── оплата ─────────────────────────────────────────────────
  const companyBox = h('div', { class: draft.payment === 'invoice' ? '' : 'hidden' },
    section(t('checkout.company'),
      h('.group',
        field({ label: t('checkout.companyName'), placeholder: t('checkout.companyPlaceholder'), value: draft.company.name, onInput: (v) => { draft.company.name = v; saveDraft({}); } }),
        field({ label: t('checkout.trn'), placeholder: t('checkout.trnPlaceholder'), inputmode: 'numeric', value: draft.company.trn, onInput: (v) => { draft.company.trn = v; saveDraft({}); } }),
        field({ label: t('checkout.vatNumber'), placeholder: 'VAT / INN', inputmode: 'numeric', value: draft.company.vat, onInput: (v) => { draft.company.vat = v; saveDraft({}); } }),
        field({ label: t('checkout.legalAddress'), placeholder: t('checkout.addressPlaceholder'), value: draft.company.address, onInput: (v) => { draft.company.address = v; saveDraft({}); } }),
        field({ label: t('checkout.invoiceEmail'), placeholder: 'accounts@company.ae', type: 'email', value: draft.company.email, onInput: (v) => { draft.company.email = v; saveDraft({}); } })),
      h('.section-footer', t('checkout.invoiceNote'))),
  );

  const payCells = payments.map((p) => {
    const radio = h('.radio', { class: draft.payment === p.id ? 'on' : '' });
    const cell = h('.cell.tappable', { class: p.enabled ? '' : 'disabled' },
      h('.cell-icon', { html: icon(PAY_ICONS[p.id] || 'card', 19) }),
      h('.cell-body', h('.cell-title', p.title), h('.cell-sub', p.enabled ? p.subtitle : p.hint)),
      radio);
    tap(cell, () => {
      if (!p.enabled) {
        toast(p.hint || '');
        return;
      }
      draft.payment = p.id;
      saveDraft({});
      for (const [i, c] of payCells.entries()) {
        c.querySelector('.radio').classList.toggle('on', payments[i].id === p.id);
      }
      companyBox.classList.toggle('hidden', p.id !== 'invoice');
      recalc();
    }, 'select');
    return cell;
  });

  const commentField = field({
    label: '', placeholder: t('checkout.commentPlaceholder'), multiline: true, value: draft.comment,
    onInput: (v) => { draft.comment = v; saveDraft({}); },
  });

  // ── отправка ───────────────────────────────────────────────
  let submitting = false;
  async function submit() {
    if (submitting) return;
    const errors = [];
    if (!draft.customer.name.trim()) errors.push(t('checkout.f.name'));
    if (draft.customer.phone.replace(/\D/g, '').length < 7) errors.push(t('checkout.f.phone'));
    if (draft.payment === 'invoice') {
      if (!draft.company.name.trim()) errors.push(t('checkout.f.company'));
      if (!(draft.company.trn.trim().length >= 5 || draft.company.vat.trim().length >= 5)) errors.push(t('checkout.f.trn'));
    }
    if (draft.payment === 'card' && !/^\S+@\S+\.\S+$/.test(draft.customer.email)) errors.push(t('checkout.f.email'));
    if (draft.delivery.method !== 'pickup' && !draft.delivery.city.trim()) errors.push(t('checkout.f.city'));

    if (errors.length) {
      tg.haptic('error');
      toast(t('checkout.fillIn', { fields: errors.join(', ') }), 2800);
      return;
    }

    submitting = true;
    tg.haptic('light');
    if (tg.inTelegram) tg.mainButton({ text: t('checkout.sending'), progress: true, active: false });
    payBtn.disabled = true;
    payBtn.textContent = t('checkout.sending');

    try {
      const res = await api.createOrder({
        items: cartDetailed().map((it) => ({ id: it.id, qty: it.qty })),
        customer: draft.customer,
        delivery: draft.delivery,
        company: draft.company,
        comment: draft.comment,
        paymentMethod: draft.payment,
      });
      clearCart();
      tg.haptic('success');

      if (res.confirmationUrl) {
        tg.openLink(res.confirmationUrl);
        navigate('order', { id: res.order.id, awaitingPayment: true }, { replaceStack: true, tab: 'profile' });
      } else {
        navigate('order', { id: res.order.id, justCreated: true }, { replaceStack: true, tab: 'profile' });
      }
    } catch (err) {
      tg.haptic('error');
      toast(err.message || t('checkout.failed'), 3200);
      submitting = false;
      payBtn.disabled = false;
      recalc();
    }
  }

  tap(payBtn, submit);

  const content = h('div',
    section(t('checkout.contacts'), h('.group', nameField, phoneField, emailField)),
    section(t('checkout.delivery'), h('.group', ...deliveryCells)),
    section(t('checkout.deliveryAddress'), h('.group', cityField, addressField),
      h('.section-footer', state.config?.delivery?.note || '')),
    section(t('checkout.payment'), h('.group', ...payCells)),
    companyBox,
    section(t('checkout.comment'), h('.group', commentField)),
    section(t('checkout.yourOrder'),
      h('.group',
        ...items.map((it) => h('.summary-row',
          h('span', { style: { color: 'var(--label-2)' } }, `${it.name} × ${it.qty}`),
          h('span.mono', money(it.sum)))),
        h('.summary-row', h('span', t('cart.goods')), subtotalEl),
        h('.summary-row', h('span', t('cart.shipping')), shippingEl),
        h('.summary-row.total', h('span', t('cart.total')), totalEl))),
    h('div', { style: { padding: '18px 16px 8px' } }, payBtn),
    h('.section-footer', { style: { padding: '0 20px 24px' } }, t('checkout.consent')),
  );

  recalc();

  return {
    title: t('checkout.title'),
    tabbar: false,
    content,
    onMount: () => { if (tg.inTelegram) tg.mainButton({ text: payLabel(), onClick: submit }); },
    onDestroy: () => tg.hideMainButton(),
  };
}
