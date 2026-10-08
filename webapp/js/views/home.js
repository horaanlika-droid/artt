/**
 * Главная: платформенные обложки по новым референсам.
 *  - iPhone/Android: hero с тройкой бокалов, «Timeless glassware…», Explore Collection;
 *    ниже — список коллекций, хиты, новинки, о бренде.
 *  - iPad/Desktop: hero «Cocktails Deserve Better Glass» с рейлом коллекций справа,
 *    лента коллекций, сетка деталей с панелью корзины и плашкой доверия.
 */
import { h, tap, section, t, money } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, categoryProducts, subscribe, cartDetailed, cartSubtotal } from '../state.js';
import { locale } from '../i18n.js';
import { qtyStepper, trustBadges, detailCard, collectionRow, productCard } from '../components.js';

function trioProducts() {
  const list = categoryProducts('levitating').filter((p) => p.image);
  const fallback = state.products.filter((p) => p.image);
  return (list.length >= 3 ? list : fallback).slice(0, 3);
}

/* ── мобильное hero (iPhone / Android) ─────────────────────── */
function mobileHero(trio) {
  const glasses = trio.map((p, i) => h('img.m-hero-glass', {
    class: `m-hero-glass-${i + 1}`,
    src: p.image,
    alt: p.name,
    loading: 'eager',
    decoding: 'async',
  }));
  return h('section.m-hero',
    h('.m-hero-stage', h('.m-hero-glow'), ...glasses),
    h('.m-hero-copy',
      h('h1.m-hero-title', t('home.mobileHeroTitle')),
      tap(h('button.m-hero-cta',
        h('span', t('home.explore')),
        h('span.cta-arrow', { html: icon('arrowRight', 17) })),
      () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' }), 'light')));
}

/* ── широкое hero (iPad / Desktop) ─────────────────────────── */
function desktopHero(trio, onPick) {
  const glasses = trio.map((p, i) => h('img.d-hero-glass', {
    class: `d-hero-glass-${i + 1}`,
    src: p.image,
    alt: p.name,
    loading: 'eager',
    decoding: 'async',
  }));

  const railItem = (c, active) => tap(h('button.rail-item', { class: active ? 'active' : '' }, c.title),
    () => onPick(c.id), 'select');

  const glassCats = state.categories.filter((c) => c.id !== 'teapot');
  const accessories = state.categories.filter((c) => c.id === 'teapot');

  return h('section.d-hero',
    h('.d-hero-copy',
      h('.d-kicker', t('home.kicker')),
      h('h1.d-title', t('home.headline')),
      h('p.d-text', t('home.heroText')),
      tap(h('button.d-cta',
        h('span', t('home.explore')),
        h('span.cta-arrow', { html: icon('arrowRight', 17) })),
      () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' }), 'light')),
    h('.d-hero-art', h('.d-hero-glow'), ...glasses),
    h('.d-hero-rail',
      h('.rail-title', t('home.railTitle')),
      ...glassCats.map((c, i) => railItem(c, i === 0)),
      accessories.length ? h('.rail-title.accessories', t('home.railAccessories')) : null,
      ...accessories.map((c) => railItem(c, false))));
}

/* ── лента коллекций ───────────────────────────────────────── */
function collectionStrip() {
  return h('.strip', ...state.categories.map((c) => {
    const sample = categoryProducts(c.id)[0];
    const tile = h('.strip-tile',
      h('.strip-media', sample?.image
        ? h('img', { src: sample.image, alt: '', loading: 'lazy' })
        : h('.pcard-noimg', { html: icon('coupe', 26) })),
      h('.strip-name', c.title),
      h('.strip-sub', c.id === 'teapot' ? t('home.railAccessories') : t('home.stripSub')));
    tap(tile, () => navigate('catalog', { category: c.id }), 'light');
    return tile;
  }));
}

/* ── панель корзины (desktop/iPad) ─────────────────────────── */
function cartPanel() {
  const panel = h('.cart-panel');
  function render() {
    const items = cartDetailed();
    const subtotal = cartSubtotal();
    const rate = state.config?.currencies?.usdRate || state.config?.brand?.usdRate;
    panel.innerHTML = '';
    panel.append(
      h('.cart-panel-head', h('b', t('cart.yours')),
        h('span.cart-panel-count', String(items.reduce((s, i) => s + i.qty, 0)))),
      items.length
        ? h('.cart-panel-items', ...items.map((it) => h('.cart-panel-row',
          h('.cart-panel-thumb', it.image ? h('img', { src: it.image, alt: '' }) : null),
          h('.cart-panel-body',
            h('.cart-panel-name', it.name),
            h('.cart-panel-price', `${money(it.price)}${it.qty > 1 ? ` × ${it.qty}` : ''}`),
            qtyStepper(it.id, it.qty, () => render())),
          tap(h('button.cart-panel-remove', { html: icon('close', 14), 'aria-label': '×' }), () => {
            import('../state.js').then(({ setQty }) => { setQty(it.id, 0); });
          }, 'light'))))
        : h('.cart-panel-empty', t('cart.empty')),
      h('.cart-panel-total',
        h('span', t('cart.total')),
        h('b', `${money(subtotal)}${rate ? ` · USD ${(subtotal / rate).toFixed(1)}` : ''}`)),
      tap(h('button.cart-panel-cta',
        h('span', t('cart.proceed')),
        h('span.cta-arrow', { html: icon('arrowRight', 16) })),
      () => navigate('cart', {}, { replaceStack: true, tab: 'cart' }), 'light'),
      trustBadges());
  }
  render();
  return { panel, render };
}

/* ── торговая секция: сетка + корзина ──────────────────────── */
function shopSection(initialCategory) {
  let activeId = initialCategory || state.categories[0]?.id;
  const grid = h('.dgrid');
  const headTitle = h('h2');
  const head = h('.row-head', headTitle,
    tap(h('a', `${t('home.allProducts')} `, h('span', { html: icon('chevron', 13) })),
      () => navigate('catalog', { category: activeId }), 'light'));

  function renderGrid() {
    const cat = state.categories.find((c) => c.id === activeId) || state.categories[0];
    const list = categoryProducts(cat?.id).length ? categoryProducts(cat?.id) : state.products;
    headTitle.textContent = cat?.title || '';
    grid.innerHTML = '';
    grid.append(...list.map((p) => detailCard(p)));
  }
  renderGrid();

  const cart = cartPanel();
  const unsubscribe = subscribe((event) => { if (event === 'cart') cart.render(); });

  const wrap = h('.shop-split',
    h('.shop-main', h('.shop-head', head), grid),
    h('.shop-aside', cart.panel));

  return {
    wrap,
    pick(categoryId) {
      activeId = categoryId;
      renderGrid();
    },
    destroy: unsubscribe,
  };
}

/* ── полоса преимуществ ────────────────────────────────────── */
function featureStrip() {
  const cell = (image, title, sub, withArt) => h('.feat-cell',
    withArt && image ? h('.feat-art', h('img', { src: image, alt: '', loading: 'lazy' })) : null,
    h('.feat-copy', h('b', title), h('span', sub)));
  const trio = trioProducts();
  return h('.feat-strip',
    cell(trio[1]?.image, t('feat.blown'), t('feat.blownSub'), true),
    cell(null, t('feat.classics'), t('feat.classicsSub'), false),
    cell(trio[0]?.image, t('feat.more'), t('feat.moreSub'), true));
}

export default function homeView() {
  const trio = trioProducts();
  const hits = state.products.filter((p) => p.isHit).slice(0, 10);
  const news = state.products.filter((p) => p.isNew).slice(0, 10);
  const brand = state.config?.brand || {};

  const shop = shopSection('retro-asia');

  const searchBar = tap(h('.searchbar.searchbar-home',
    h('span', { html: icon('search', 17) }),
    h('span', { style: { color: 'var(--ink-3)', fontSize: '16px' } }, t('home.search'))),
  () => navigate('search'));

  const content = h('div',
    mobileHero(trio),
    desktopHero(trio, (id) => shop.pick(id)),
    collectionStrip(),
    shop.wrap,
    featureStrip(),

    /* мобильные секции ниже обложки */
    h('.m-only',
      h('.home-top', searchBar),
      h('.section-title.m-collections-title', t('home.collectionsTitle')),
      h('.crow-list', ...state.categories.map((c) => collectionRow(c, categoryProducts(c.id)[0]))),

      hits.length ? h('div', { style: { marginTop: '26px' } },
        h('.row-head', h('h2', t('home.popular')),
          tap(h('a', `${t('home.allProducts')} `, h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
        h('.hscroll', ...hits.map((p) => productCard(p, { fixedWidth: true })))) : null,

      news.length ? h('div', { style: { marginTop: '26px' } },
        h('.row-head', h('h2', t('home.new'))),
        h('.hscroll', ...news.map((p) => productCard(p, { fixedWidth: true })))) : null,

      h('.features',
        ...[1, 2, 3, 4].map((n) => h('.feature',
          h('span', { html: icon(['truck', 'coupe', 'diamond', 'card'][n - 1], 20) }),
          h('span', t(`home.feature${n}`))))),

      section(t('home.about'),
        h('.group',
          h('.cell', { style: { display: 'block', padding: '14px' } },
            h('div', { style: { fontSize: '14.5px', lineHeight: '1.5', color: 'var(--label-2)' } },
              state.config?.brand?.about || '')),
          h('.cell', { style: { display: 'grid', gap: '4px', padding: '14px' } },
            h('.cell-sub', `${brand.address || ''}`),
            h('.cell-sub', `${brand.phone || ''} · ${brand.email || ''}`)))),

      section(t('home.delivery'),
        h('.group',
          h('.cell', { style: { display: 'block', padding: '14px' } },
            h('div', { style: { fontSize: '14.5px', lineHeight: '1.5', color: 'var(--label-2)' } },
              state.config?.delivery?.note || '')))),

      h('.brand-footer',
        h('img', { src: 'assets/brand/logo-dark.svg', alt: 'Cocktail Embassy' }),
        h('p.brand-footer-title', brand.name || 'Cocktail Embassy'),
        h('p', `${state.products.length} ${locale.current === 'en' ? 'pieces' : 'позиций'} · ${brand.city || 'Dubai'}, ${brand.country || 'UAE'}`),
        h('p', brand.email || ''))));

  return {
    title: 'Cocktail Embassy',
    titleClass: ['brand-mark'],
    content,
    classes: ['home-screen'],
    tab: 'home',
    navLogo: false,
    navLanguage: false,
    hideTitleUntilScroll: false,
    onDestroy: () => shop.destroy?.(),
  };
}
