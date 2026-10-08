/** Избранное. */
import { h, tap, emptyState, t, positionsLabel } from '../ui.js';
import { navigate } from '../router.js';
import { favoriteProducts, state } from '../state.js';
import { productCard, productRow } from '../components.js';

export default function favoritesView() {
  const items = favoriteProducts();

  if (!items.length) {
    const hits = state.products.filter((p) => p.isHit).slice(0, 10);
    return {
      title: t('favorites.title'),
      tab: 'favorites',
      content: h('div', { style: { paddingTop: '30px' } },
        emptyState({
          emoji: '🤍',
          title: t('favorites.empty'),
          text: t('favorites.emptyHint'),
          action: tap(h('button.btn', { style: { width: 'auto', padding: '0 22px', marginTop: '8px' } }, t('cart.toCatalog')),
            () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' })),
        }),
        hits.length ? h('div', h('.row-head', h('h2', t('favorites.mayLike'))), productRow(hits)) : null),
    };
  }

  return {
    title: t('favorites.title'),
    tab: 'favorites',
    content: h('div', { style: { paddingTop: '14px' } },
      h('.tiny.muted-ink', { style: { padding: '0 20px 10px' } }, positionsLabel(items.length)),
      h('.product-grid', ...items.map((p) => productCard(p)))),
  };
}
