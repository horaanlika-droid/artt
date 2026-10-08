/** Переиспользуемые карточки: товар, коллекция, степпер количества. */
import { h, tap, t, money, usdHint, positionsLabel, glint } from './ui.js';
import { icon } from './icons.js';
import { navigate } from './router.js';
import { locale } from './i18n.js';
import { state, addToCart, inCart, isFavorite, toggleFavorite, setQty, categoryCount } from './state.js';

export function productCard(p, { fixedWidth = false } = {}) {
  const media = h('.pcard-media');
  if (p.image) {
    const img = h('img', {
      src: p.image,
      alt: p.name,
      loading: 'eager',
      decoding: 'async',
      fetchPriority: 'high',
    });
    const missing = () => h('.pcard-noimg', { html: icon('coupe', 34) });
    media.append(img);
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.replaceWith(missing()), { once: true });
    if (img.complete) {
      if (img.naturalWidth > 0) img.classList.add('loaded');
      else img.replaceWith(missing());
    }
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
    glint(media);
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
  tap(card, () => {
    card.classList.add('selected', 'glare-effect');
    setTimeout(() => {
      card.classList.remove('selected', 'glare-effect');
      navigate('product', { id: p.id });
    }, 450);
  }, 'light');
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

/** Плашка доверия из референсов: качество / доставка / оплата. */
export function trustBadges() {
  const row = (iconName, title, sub) => h('.trust-row',
    h('span.trust-ico', { html: icon(iconName, 17) }),
    h('.trust-text', h('b', title), h('span', sub)));
  return h('.trust',
    row('shield', t('trust.quality'), t('trust.qualitySub')),
    row('truck', t('trust.delivery'), t('trust.deliverySub')),
    row('lock', t('trust.payment'), t('trust.paymentSub')));
}

/** Чипы характеристик карточки товара, как в референсе (Capacity / Height / Ø / Material). */
export function specChips(p) {
  const chip = (iconName, label, value) => value
    ? h('.spec-chip', h('span.spec-ico', { html: icon(iconName, 16) }),
      h('.spec-text', h('span', label), h('b', value)))
    : null;
  const chips = [
    chip('coupe', t('spec.capacity'), p.volumeLabel && p.volumeLabel !== '—' ? p.volumeLabel : ''),
    chip('ruler', t('spec.height'), p.heightMm ? `${p.heightMm} mm` : ''),
    chip('diameter', 'Ø', p.diameterMm ? `${p.diameterMm} mm` : ''),
  ].filter(Boolean);
  return h('.spec-chips', ...chips,
    h('.spec-material',
      h('span.spec-ico', { html: icon('diamond', 16) }),
      h('.spec-text', h('span', t('spec.material')), h('b', p.material || ''))),
    h('.spec-cod', `${t('common.article')} ${p.article}`),
    p.handBlown ? h('.spec-flag', t('product.handBlowing')) : null);
}

/** Детальная карточка для desktop-сетки: фото, specs, цена и кнопка корзины. */
export function detailCard(p) {
  const media = h('.dcard-media');
  if (p.image) {
    const img = h('img', { src: p.image, alt: p.name, loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(h('.pcard-noimg', { html: icon('coupe', 34) })), { once: true });
    media.append(img);
  } else media.append(h('.pcard-noimg', { html: icon('coupe', 34) }));
  if (p.isNew) media.append(h('.badge.new', t('product.new')));
  else if (p.isHit) media.append(h('.badge', t('product.hit')));

  const count = inCart(p.id);
  const addBtn = h('button.add-btn', {
    class: count ? 'in-cart' : '',
    'aria-label': t('product.add'),
    html: count ? `<b style="font-size:13px">${count}</b>` : icon('bag', 16),
  });
  tap(addBtn, (e) => {
    e.stopPropagation();
    if (p.outOfStock || p.price === null) { navigate('product', { id: p.id }); return; }
    addToCart(p.id);
    glint(media);
    const n = inCart(p.id);
    addBtn.classList.add('in-cart');
    addBtn.innerHTML = `<b style="font-size:13px">${n}</b>`;
  }, 'light');

  const spec = (label, value) => value
    ? h('.dcard-spec', h('span', label), h('b', value))
    : null;

  const card = h('.dcard',
    media,
    h('.dcard-body',
      h('.dcard-name', p.name),
      spec(t('spec.capacity'), p.volumeLabel && p.volumeLabel !== '—' ? p.volumeLabel : ''),
      spec(t('spec.height'), p.heightMm ? `${p.heightMm} mm` : ''),
      spec('Ø', p.diameterMm ? `${p.diameterMm} mm` : ''),
      spec(t('spec.material'), p.materialShort || p.material || ''),
      spec(locale.current === 'en' ? 'COD' : 'Артикул', p.article),
      h('.dcard-foot',
        h('.dcard-price',
          p.price === null ? h('span', t('product.ask')) : h('span',
            h('b', money(p.price)),
            h('i', usdHint(p.priceUsd, p.price, state.config?.currencies?.usdRate || state.config?.brand?.usdRate)))),
        p.outOfStock ? null : addBtn)));
  tap(card, () => navigate('product', { id: p.id }), 'light');
  return card;
}

/** Строка коллекции для мобильного списка (референс Collections). */
export function collectionRow(category, sampleProduct) {
  const row = h('.crow',
    h('.crow-media', sampleProduct?.image ? h('img', { src: sampleProduct.image, alt: '', loading: 'lazy' }) : h('.pcard-noimg', { html: icon('coupe', 26) })),
    h('.crow-body',
      h('.crow-kicker', 'PREMIUM'),
      h('.crow-title', category.title),
      h('.crow-sub', category.subtitle || '')),
    h('.crow-chevron', { html: icon('chevron', 16) }));
  tap(row, () => navigate('catalog', { category: category.id }), 'light');
  return row;
}
