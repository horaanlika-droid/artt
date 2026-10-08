/** Карточка товара: акцентная мобильная карточка и подробности каталога ниже. */
import { h, tap, section, money, usdHint, t, toast, glint } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { tg } from '../tg.js';
import { locale } from '../i18n.js';
import { state, product, addToCart, inCart, isFavorite, toggleFavorite, categoryProducts } from '../state.js';
import { productCard, qtyStepper, specChips } from '../components.js';

function featureDescription() {
  return locale.current === 'en'
    ? 'An ultra-delicate, elongated pony glass designed for minimal elegance. Replicates classic proportions, suspended for a unique experience.'
    : 'Изящный вытянутый бокал-пони для лаконичной сервировки. Классические пропорции и тонкая ножка создают ощущение лёгкости.';
}

export default function productView({ id }) {
  const p = product(id);
  if (!p) {
    return {
      title: t('catalog.title'),
      content: h('div', { style: { paddingTop: '40px' } },
        h('.empty', h('h3', t('catalog.nothing')), h('p', t('catalog.nothingHint')))),
    };
  }

  const isFeatureProduct = p.id === 'AG0020';
  const inStock = !p.outOfStock;
  const collection = state.categories.find((c) => c.id === p.category);
  const rate = state.config?.currencies?.usdRate || state.config?.brand?.usdRate;
  const productTitle = isFeatureProduct && p.volumeLabel
    ? `${p.name} (${p.volumeLabel})`
    : p.name;
  const productLabel = isFeatureProduct
    ? (locale.current === 'en' ? 'Hand-Blown Crystal' : 'Хрусталь ручной выдувки')
    : (collection?.title || '');
  const description = isFeatureProduct ? featureDescription() : p.description;
  const photo = p.image
    ? h('img', { src: p.image, alt: productTitle, loading: 'eager', decoding: 'async', fetchPriority: 'high' })
    : h('.pcard-noimg', { html: icon('coupe', 60) });
  if (photo instanceof HTMLImageElement) {
    photo.addEventListener('error', () => photo.replaceWith(h('.pcard-noimg', { html: icon('coupe', 60) })), { once: true });
  }

  const gallery = h('.pd-gallery',
    h('.pd-flags',
      p.isNew ? h('.badge.new', t('product.new')) : null,
      p.isHit ? h('.badge', t('product.hit')) : null,
      p.engraving ? h('.badge', t('product.engraving')) : null),
    photo,
    h('button.fav-btn', {
      style: { position: 'absolute', top: '12px', right: '12px' },
      class: isFavorite(p.id) ? 'on' : '',
      html: icon(isFavorite(p.id) ? 'heartFill' : 'heart', 19),
      'aria-label': locale.current === 'en' ? 'Save item' : 'В избранное',
      onclick: (e) => {
        e.stopPropagation();
        const on = toggleFavorite(p.id);
        const btn = e.currentTarget;
        btn.classList.toggle('on', on);
        btn.innerHTML = icon(on ? 'heartFill' : 'heart', 19);
      },
    }));

  const priceRow = p.price === null
    ? h('.pd-price-row', h('span.pd-price', t('product.ask')))
    : h('.pd-price-row',
      h('span.pd-price', money(p.price)),
      h('span.pd-usd', usdHint(p.priceUsd, p.price, rate)),
      h('span.pd-unit', t('common.piece')));

  const specs = h('.group', ...(p.specs || []).map((s) => h('.cell',
    h('.cell-body', h('.cell-title', { style: { fontSize: '14.5px', color: 'var(--label-2)' } }, s.key)),
    h('.cell-value', { style: { fontSize: '14.5px', textAlign: 'right' } }, s.value))));

  const similar = categoryProducts(p.category).filter((x) => x.id !== p.id).slice(0, 8);

  const qtyBox = h('div.pd-quantity', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px 0' } });
  if (inStock && p.price !== null) {
    const label = h('span.tiny.muted-ink', t('cart.qty'));
    qtyBox.append(label, h('.spacer'), qtyStepper(p.id, Math.max(1, inCart(p.id) || 1)));
  }

  const actionLabel = p.price === null
    ? t('product.ask')
    : !inStock ? t('product.comingSoon')
      : isFeatureProduct
        ? (locale.current === 'en' ? 'ADD TO CART' : 'В КОРЗИНУ')
        : `${t('product.add')} · ${money(p.price)}`;

  const actionBtn = tap(h('button.btn.product-add-button', actionLabel), () => {
    if (p.price === null || !inStock) {
      navigate('support', { prefill: `${t('product.ask')}: ${p.name} (${p.article}) — ` });
      return;
    }
    addToCart(p.id);
    glint(gallery);
    tg.haptic('success');
    toast(`${p.name} — ${t('product.inCart')}`);
  });

  const content = h('div',
    gallery,
    h('.pd-head',
      h('h1.pd-name', productTitle),
      h('.pd-collection', productLabel),
      priceRow),
    h('.pd-desc', description),
    specChips(p),
    qtyBox,
    h('div.pd-action-wrap', actionBtn),
    h('.section-footer', { style: { padding: '8px 20px 0' } }, p.lead || ''),
    p.comingSoon ? h('.notice', t('product.askHint')) : null,
    section(t('product.specs'), specs,
      h('.section-footer', `${t('common.article')} ${p.article}`)),

    similar.length ? h('div',
      h('.row-head', { style: { marginTop: '24px' } }, h('h2', t('product.similar'))),
      h('.hscroll', ...similar.map((x) => productCard(x, { fixedWidth: true })))) : null,

    h('div', { style: { height: '24px' } }),
  );

  return {
    title: 'Cocktail Embassy',
    tab: 'home',
    classes: ['product-detail-screen'],
    content,
    navLogo: false,
    navLanguage: false,
    onDestroy: () => tg.hideMainButton(),
    navRight: null,
    onReturn: () => tg.hideMainButton(),
    __locale: locale.current,
  };
}
