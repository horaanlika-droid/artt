/** Главная: обложка коллекции (IMG_1431), коллекции, подборки, условия доставки. */
import { h, tap, section, t, money } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, categoryProducts } from '../state.js';
import { locale } from '../i18n.js';
import { categoryCard, productRow } from '../components.js';

/** Обложка: коллекция с наибольшим числом фото — слайды берём из неё (Levitating по умолчанию). */
function heroCollection() {
  const cats = state.categories.filter((c) => categoryProducts(c.id).some((p) => p.image));
  return cats.find((c) => c.id === 'levitating') || cats[0] || null;
}

function hero() {
  const collection = heroCollection();
  const items = collection ? categoryProducts(collection.id).filter((p) => p.image).slice(0, 3) : [];

  const slides = items.map((p, i) => h('.hero-slide', { class: i === 0 ? 'active' : '' },
    h('img', { src: p.image, alt: p.name || '', loading: i === 0 ? 'eager' : 'lazy' })));
  const dots = items.map((_, i) => h('.hero-dot', { class: i === 0 ? 'active' : '' }));

  const nameEl = h('h2.hero-name');
  const priceEl = h('.hero-price');
  const subEl = h('p.hero-sub');

  const renderText = (i) => {
    const p = items[i];
    nameEl.textContent = p?.name || '';
    priceEl.textContent = p && p.price !== null ? money(p.price) : '';
    subEl.textContent = collection?.subtitle || '';
  };
  renderText(0);

  const box = h('.hero',
    h('h1.hero-title', collection?.title || 'Cocktail Embassy'),
    h('.hero-stage', ...slides),
    h('.hero-info', nameEl, priceEl, subEl),
    h('.hero-dots', ...dots),
    tap(h('button.hero-cta', h('span', t('home.cta')), h('span', { html: icon('chevron', 16) })),
      () => navigate('catalog', collection ? { category: collection.id } : {})));

  let index = 0;
  box.timer = setInterval(() => {
    if (!items.length) return;
    slides[index].classList.remove('active');
    dots[index].classList.remove('active');
    index = (index + 1) % items.length;
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    renderText(index);
  }, 5600);
  return box;
}

export default function homeView() {
  const hits = state.products.filter((p) => p.isHit).slice(0, 10);
  const news = state.products.filter((p) => p.isNew).slice(0, 10);
  const stemmed = categoryProducts('levitating').concat(categoryProducts('coupethini')).slice(0, 10);
  const heroEl = hero();
  const brand = state.config?.brand || {};

  const searchBar = tap(h('.searchbar.searchbar-home',
    h('span', { html: icon('search', 17) }),
    h('span', { style: { color: 'var(--ink-3)', fontSize: '16px' } }, t('home.search'))),
  () => navigate('search'));

  const content = h('div',
    heroEl,
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

    stemmed.length ? h('div', { style: { marginTop: '28px' } },
      h('.row-head', h('h2', locale.current === 'en' ? 'Stemmed glassware' : 'На ножке'),
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
    title: 'Cocktail Embassy',
    content,
    tab: 'home',
    hideTitleUntilScroll: true,
    navRight: tap(h('button.nav-btn.icon', { html: icon('chat', 22) }), () => navigate('support')),
    onDestroy: () => clearInterval(heroEl.timer),
  };
}
