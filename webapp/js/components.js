/** Переиспользуемые карточки: товар, коллекция, степпер количества. */
import { h, tap, t, money, usdHint, positionsLabel } from './ui.js';
import { icon } from './icons.js';
import { navigate } from './router.js';
import { state, addToCart, inCart, isFavorite, toggleFavorite, setQty, categoryCount } from './state.js';

export function productCard(p, { fixedWidth = false } = {}) {
  const media = h('.pcard-media');
  if (p.image) {
    const img = h('img', { src: p.image, alt: p.name, loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => img.classList.add('loaded'));
    if (img.complete) img.classList.add('loaded');
    media.append(img);
  } else {
    media.append(h('.pcard-noimg', { html: icon('coupe', 34) }));
  }
  if (p.comingSoon) media.append(h('.badge.oos', t('product.comingSoon')));
  else if (p.outOfStock) media.append(h('.badge.oos', t('product.outOfStock')));
  else if (p.isNew) media.append(h('.badge.new', t('product.new')));
  else if (p.isHit) media.append(h('.badge', t('product.hit')));

  const fav = h('button.fav-btn', { class: isFavorite(p.id) ? 'on' : '', html: icon(isFavorite(p.id) ? 'heartFill' : 'heart', 17) });
  tap(fav, (e) => {
    e.stopPropagation();
    const on = toggleFavorite(p.id);
    fav.classList.toggle('on', on);
    fav.innerHTML = icon(on ? 'heartFill' : 'heart', 17);
  }, 'select');
  media.append(fav);

  const count = inCart(p.id);
  const addBtn = h('button.add-btn', {
    class: count ? 'in-cart' : '',
    html: count ? `<b style="font-size:13px">${count}</b>` : icon('plus', 17),
  });
  tap(addBtn, (e) => {
    e.stopPropagation();
    if (p.outOfStock || p.price === null) {
      navigate('product', { id: p.id });
      return;
    }
    addToCart(p.id);
    const n = inCart(p.id);
    addBtn.classList.add('in-cart');
    addBtn.innerHTML = `<b style="font-size:13px">${n}</b>`;
  }, 'light');

  const priceBlock = p.price === null
    ? h('span.pcard-price', { style: { fontSize: '13px' } }, t('product.ask'))
    : h('span',
      h('span.pcard-price', money(p.price)),
      h('span.pcard-usd', { style: { marginLeft: '6px' } }, usdHint(p.priceUsd, p.price, state.config?.currencies?.usdRate || state.config?.currencies?.usdRate || state.config?.brand?.usdRate)));

  const card = h('.pcard', { class: fixedWidth ? 'fixed-w' : '' },
    media,
    h('.pcard-body',
      h('.pcard-name', p.name),
      h('.pcard-sub', p.volumeLabel && p.volumeLabel !== '—' ? `${p.glassLabel} · ${p.volumeLabel}` : p.glassLabel),
      h('.pcard-foot',
        h('div', priceBlock),
        p.outOfStock ? null : addBtn)),
  );
  tap(card, () => navigate('product', { id: p.id }), 'light');
  return card;
}

export function categoryCard(category, sampleProduct) {
  const card = h('.cat-card',
    sampleProduct?.image ? h('img', { src: sampleProduct.image, alt: '', loading: 'lazy' }) : null,
    h('.cat-card-body',
      h('.cat-card-title', category.title),
      h('.cat-card-count', positionsLabel(categoryCount(category.id)))),
  );
  tap(card, () => navigate('catalog', { category: category.id }), 'light');
  return card;
}

export function qtyStepper(id, qty, onChange) {
  const label = h('span.qty', String(qty));
  return h('.stepper',
    tap(h('button', { html: icon('minus', 16) }), () => {
      const next = Math.max(0, Number(label.textContent) - 1);
      label.textContent = String(next);
      setQty(id, next);
      onChange?.(next);
    }, 'light'),
    label,
    tap(h('button', { html: icon('plus', 16) }), () => {
      const next = Number(label.textContent) + 1;
      label.textContent = String(next);
      setQty(id, next);
      onChange?.(next);
    }, 'light'),
  );
}

export function productRow(items, { fixedWidth = true } = {}) {
  return h('.hscroll', ...items.map((p) => productCard(p, { fixedWidth })));
}
