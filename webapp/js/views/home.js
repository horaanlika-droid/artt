/** Главная: обложка бренда, коллекции, подборки, условия доставки. */
import { h, tap, section, t } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, categoryProducts } from '../state.js';
import { locale } from '../i18n.js';
import { productCard, categoryCard, productRow } from '../components.js';

/** Слайды — реальные фото позиций из прайса. */
const SLIDES = [
  { article: 'AG0019', dark: true },
  { article: 'AG0015', dark: false },
  { article: 'AG0008', dark: false },
];

function hero() {
  const slides = SLIDES.map((s, i) => {
    const product = state.productsById.get(s.article);
    return h('.hero-slide', { class: `${i === 0 ? 'active' : ''}${s.dark ? ' dark' : ''}` },
      product?.image ? h('img', { src: product.image, alt: '' }) : null);
  });

  const dots = SLIDES.map((_, i) => h('.hero-dot', { class: i === 0 ? 'active' : '' }));
  const titleEl = h('.hero-title');
  const subEl = h('.hero-sub');

  const renderText = (i) => {
    titleEl.textContent = t(`home.slide${i + 1}.title`);
    subEl.textContent = t(`home.slide${i + 1}.sub`);
  };
  renderText(0);

  const box = h('.hero',
    h('.hero-brand',
      h('img', { src: 'assets/brand/logo.svg', alt: 'Cocktail Embassy' }),
      h('span', 'Bar & restaurant glassware')),
    titleEl,
    subEl,
    h('.hero-stage', ...slides),
    h('.hero-dots', ...dots),
    tap(h('button.hero-cta', h('span', t('home.cta')), h('span', { html: icon('chevron', 16) })),
      () => navigate('catalog')));

  let index = 0;
  box.timer = setInterval(() => {
    slides[index].classList.remove('active');
    dots[index].classList.remove('active');
    index = (index + 1) % SLIDES.length;
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    renderText(index);
  }, 5600);
  return box;
}

function brandStrip() {
  const brand = state.config?.brand || {};
  return h('.brand-strip',
    h('.brand-strip-logo-wrap', h('img.brand-strip-logo', { src: 'assets/brand/icon.svg', alt: '' })),
    h('.brand-strip-body',
      h('.brand-strip-chips',
        h('.brand-chip', `${state.products.length} ${locale.current === 'en' ? 'pieces' : 'позиций'}`),
        h('.brand-chip', brand.city || 'Dubai'),
        h('.brand-chip', `${t('profile.currency')}: AED`)),
      h('.brand-strip-tagline', state.config?.brand?.tagline || '')));
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
    h('.home-top', brandStrip(), h('div', { style: { paddingTop: '12px' } }, searchBar)),
    heroEl,
    h('.features',
      ...[1, 2, 3, 4].map((n) => h('.feature',
        h('span', { html: icon(['truck', 'coupe', 'diamond', 'card'][n - 1], 22) }),
        h('span', t(`home.feature${n}`))))),

    h('.row-head', h('h2', t('home.categories')),
      tap(h('a', `${t('common.all')} `, h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
    h('.cat-grid', ...state.categories.slice(0, 6).map((c) => categoryCard(c, categoryProducts(c.id)[0]))),

    hits.length ? h('div',
      h('.row-head', h('h2', t('home.popular')),
        tap(h('a', `${t('home.allProducts')} `, h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
      productRow(hits)) : null,

    news.length ? h('div',
      h('.row-head', h('h2', t('home.new'))),
      productRow(news)) : null,

    stemmed.length ? h('div',
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
