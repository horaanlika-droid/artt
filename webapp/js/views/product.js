/** Карточка товара: фото из прайса, характеристики, похожие позиции. */
import { h, tap, section, money, usdHint, t, toast } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { tg } from '../tg.js';
import { locale } from '../i18n.js';
import { state, product, addToCart, inCart, isFavorite, toggleFavorite, categoryProducts } from '../state.js';
import { productCard, qtyStepper } from '../components.js';

export default function productView({ id }) {
  const p = product(id);
  if (!p) {
    return {
      title: t('catalog.title'),
      content: h('div', { style: { paddingTop: '40px' } },
        h('.empty', h('h3', t('catalog.nothing')), h('p', t('catalog.nothingHint')))),
    };
  }

  const inStock = !p.outOfStock;
  const collection = state.categories.find((c) => c.id === p.category);
  const rate = state.config?.currencies?.usdRate || state.config?.brand?.usdRate;

  const gallery = h('.pd-gallery',
    h('.pd-flags',
      p.isNew ? h('.badge.new', t('product.new')) : null,
      p.isHit ? h('.badge', t('product.hit')) : null,
      p.engraving ? h('.badge', t('product.engraving')) : null),
    p.image ? h('img', { src: p.image, alt: p.name }) : h('.pcard-noimg', { html: icon('coupe', 60) }),
    h('button.fav-btn', {
      style: { position: 'absolute', top: '12px', right: '12px' },
      class: isFavorite(p.id) ? 'on' : '',
      html: icon(isFavorite(p.id) ? 'heartFill' : 'heart', 19),
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

  const qtyBox = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px 0' } });
  if (inStock && p.price !== null) {
    const label = h('span.tiny.muted', t('cart.qty'));
    qtyBox.append(label, h('.spacer'), qtyStepper(p.id, Math.max(1, inCart(p.id) || 1)));
  }

  const actionLabel = p.price === null
    ? t('product.ask')
    : inStock ? `${t('product.add')} · ${money(p.price)}` : t('product.comingSoon');

  const actionBtn = tap(h('button.btn', actionLabel), () => {
    if (p.price === null) {
      navigate('support', { prefill: `${t('product.ask')}: ${p.name} (${p.article}) — ` });
      return;
    }
    if (!inStock) {
      navigate('support', { prefill: `${t('product.ask')} ${p.name} (${p.article}) — ` });
      return;
    }
    addToCart(p.id);
    tg.haptic('success');
    toast(`${p.name} — ${t('product.inCart')}`);
  });

  const content = h('div',
    gallery,
    h('.pd-head',
      h('.pd-collection', collection?.title || ''),
      h('h1.pd-name', p.name),
      priceRow),
    h('.pd-desc', p.description),
    qtyBox,
    h('div', { style: { padding: '16px 20px 6px' } }, actionBtn),
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
    title: p.name,
    tabbar: false,
    content,
    onMount: () => {
      if (tg.inTelegram && inStock && p.price !== null) {
        tg.mainButton({
          text: actionLabel,
          onClick: () => {
            addToCart(p.id);
            tg.haptic('success');
            toast(`${p.name} — ${t('product.inCart')}`);
          },
        });
      }
    },
    onDestroy: () => tg.hideMainButton(),
    navRight: tap(h('button.nav-btn.icon', { html: icon('chat', 21) }),
      () => navigate('support', { prefill: `${t('product.ask')}: ${p.name} (${p.article}) — ` })),
    // язык может смениться — перерисуем заголовок кнопки
    onReturn: () => tg.hideMainButton(),
    __locale: locale.current,
  };
}
