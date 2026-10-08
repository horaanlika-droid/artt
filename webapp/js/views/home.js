/** Главная: мобильная продуктовая обложка и широкая обложка коллекции. */
import { h, tap, section, t, money, toast, glint } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, categoryProducts, addToCart } from '../state.js';
import { locale } from '../i18n.js';
import { tg } from '../tg.js';
import { categoryCard, productRow } from '../components.js';

function featuredProduct() {
  return state.products.find((p) => p.id === 'AG0020')
    || categoryProducts('levitating')[0]
    || state.products[0]
    || null;
}

function displayName(product) {
  if (!product) return 'Levitating Super Pony (140 ml)';
  const volume = product.volumeLabel;
  return product.id === 'AG0020' && volume
    ? `${product.name} (${volume})`
    : product.name;
}

function mobileDescription() {
  return locale.current === 'en'
    ? 'An ultra-delicate, elongated pony glass designed for minimal elegance. Replicates classic proportions, suspended for a unique experience.'
    : 'Изящный вытянутый бокал-пони для лаконичной сервировки. Классические пропорции и тонкая ножка создают ощущение лёгкости.';
}

function addFeatured(product, visual) {
  if (!product || product.price === null || product.outOfStock) {
    navigate('product', { id: product?.id || 'AG0020' });
    return;
  }
  addToCart(product.id);
  glint(visual);
  tg.haptic('success');
  toast(`${product.name} — ${locale.current === 'en' ? 'added to cart' : 'добавлен в корзину'}`);
}

function mobileHero(product) {
  const cta = locale.current === 'en' ? 'ADD TO CART' : 'В КОРЗИНУ';
  const image = product?.image || '/assets/products/AG0020.jpg';
  const picture = h('img.mobile-hero-image', {
    src: image,
    alt: displayName(product),
    loading: 'eager',
    decoding: 'async',
    fetchPriority: 'high',
  });
  picture.addEventListener('error', () => picture.replaceWith(
    h('.mobile-hero-image-fallback', { html: icon('coupe', 104) }),
  ), { once: true });

  const stage = h('.mobile-hero-stage', h('div.mobile-hero-glow'), picture);
  return h('section.mobile-home-hero',
    stage,
    h('.mobile-hero-copy',
      h('h1.mobile-hero-title', displayName(product)),
      h('.mobile-hero-kicker', locale.current === 'en' ? 'Hand-Blown Crystal' : 'Хрусталь ручной выдувки'),
      h('p.mobile-hero-description', mobileDescription()),
      tap(h('button.mobile-hero-cta', cta), () => addFeatured(product, stage), 'light')),
  );
}

function desktopDescription() {
  return locale.current === 'en'
    ? 'Hand-blown crystal glasses that defy gravity. Ultra-light, timeless, unforgettable.'
    : 'Хрустальные бокалы ручной выдувки, будто парящие в воздухе. Лёгкие, вне времени, незабываемые.';
}

function desktopHero(products) {
  const collectionItems = products.length ? products : [featuredProduct()].filter(Boolean);
  let selected = 0;
  const dots = collectionItems.slice(0, 3).map((_, index) => {
    const dot = h('button.desktop-hero-dot', {
      class: index === 0 ? 'active' : '',
      type: 'button',
      'aria-label': `${locale.current === 'en' ? 'Show item' : 'Позиция'} ${index + 1}`,
      'aria-pressed': index === 0 ? 'true' : 'false',
    });
    tap(dot, () => {
      selected = index;
      [...dot.parentElement.children].forEach((item, i) => {
        item.classList.toggle('active', i === selected);
        item.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
      });
    }, 'select');
    return dot;
  });

  const addButton = tap(h('button.desktop-hero-cta',
    h('span', locale.current === 'en' ? 'Add to Cart' : 'Добавить в корзину'),
    h('span.desktop-cta-arrow', { html: icon('arrowRight', 18) })), () => {
    addFeatured(collectionItems[selected] || collectionItems[0], art);
  }, 'light');

  const glassImages = collectionItems.slice(0, 3).map((product, index) => {
    const image = h('img.desktop-glass', {
      class: `desktop-glass-${index + 1}`,
      src: product.image,
      alt: product.name,
      loading: 'eager',
      decoding: 'async',
      fetchPriority: index === 0 ? 'high' : 'auto',
    });
    image.addEventListener('error', () => image.replaceWith(
      h('.desktop-glass-fallback', {
        class: `desktop-glass-${index + 1}`,
        html: icon('coupe', 118),
      }),
    ), { once: true });
    return image;
  });
  const art = h('.desktop-hero-art', ...glassImages);

  return h('section.desktop-home-hero',
    h('h1.desktop-hero-title', 'Levitating'),
    art,
    h('.desktop-hero-copy',
      h('h2.desktop-collection-name', 'Levitating'),
      h('.desktop-collection-label', locale.current === 'en' ? 'Cocktail Collection' : 'Коктейльная коллекция'),
      h('.desktop-collection-price', money(collectionItems[0]?.price ?? 30)),
      h('p.desktop-collection-description', desktopDescription()),
      h('.desktop-hero-dots', ...dots),
      addButton),
  );
}

export default function homeView() {
  const hits = state.products.filter((p) => p.isHit).slice(0, 10);
  const news = state.products.filter((p) => p.isNew).slice(0, 10);
  const stemmed = categoryProducts('levitating').concat(categoryProducts('coupethini')).slice(0, 10);
  const product = featuredProduct();
  const collectionItems = categoryProducts('levitating').filter((p) => p.image).slice(0, 3);
  const quickProducts = collectionItems.length
    ? collectionItems
    : state.products.filter((p) => p.image).slice(0, 3);
  const brand = state.config?.brand || {};

  const searchBar = tap(h('.searchbar.searchbar-home',
    h('span', { html: icon('search', 17) }),
    h('span', { style: { color: 'var(--ink-3)', fontSize: '16px' } }, t('home.search'))),
  () => navigate('search'));

  const content = h('div',
    mobileHero(product),
    desktopHero(collectionItems),
    quickProducts.length ? h('.home-quick-products',
      h('.row-head',
        h('h2', locale.current === 'en' ? 'Levitating collection' : 'Коллекция Levitating'),
        tap(h('a', `${locale.current === 'en' ? 'All pieces' : 'Все позиции'} `, h('span', { html: icon('chevron', 13) })),
          () => navigate('catalog', { category: 'levitating' }))),
      productRow(quickProducts)) : null,
    h('.home-top', searchBar),
    h('.features',
      ...[1, 2, 3, 4].map((n) => h('.feature',
        h('span', { html: icon(['truck', 'coupe', 'diamond', 'card'][n - 1], 20) }),
        h('span', t(`home.feature${n}`))))),

    h('.row-head', { style: { marginTop: '30px' } }, h('h2', t('home.categories')),
      tap(h('a', `${t('common.all')} `, h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
    h('.cat-grid', ...state.categories.slice(0, 6).map((c) => categoryCard(c, categoryProducts(c.id)[0]))),

    hits.length ? h('div', { style: { marginTop: '28px' } },
      h('.row-head', h('h2', t('home.popular')),
        tap(h('a', `${t('home.allProducts')} `, h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
      productRow(hits)) : null,

    news.length ? h('div', { style: { marginTop: '28px' } },
      h('.row-head', h('h2', t('home.new'))),
      productRow(news)) : null,

    stemmed.length ? h('div',
      h('.row-head', { style: { marginTop: '28px' } }, h('h2', locale.current === 'en' ? 'Stemmed glassware' : 'На ножке'),
        tap(h('a', `${t('home.watch')} `, h('span', { html: icon('chevron', 13) })),
          () => navigate('catalog', { category: 'levitating' }))),
      productRow(stemmed)) : null,

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
      h('img', { src: 'assets/brand/logo.svg', alt: 'Cocktail Embassy' }),
      h('p.brand-footer-title', brand.name || 'Cocktail Embassy'),
      h('p', `${state.products.length} ${locale.current === 'en' ? 'pieces' : 'позиций'} · ${brand.city || 'Dubai'}, ${brand.country || 'UAE'}`),
      h('p', brand.email || '')),
  );

  return {
    title: 'The Pony Glass Shop',
    content,
    classes: ['home-screen'],
    tab: 'home',
    navLogo: false,
    navLanguage: false,
    hideTitleUntilScroll: false,
  };
}
