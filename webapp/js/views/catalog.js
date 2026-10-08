import { h, tap, sheet, money, emptyState, t, positionsLabel } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { locale } from '../i18n.js';
import { platform } from '../platform.js';
import { state, searchProducts, categoryProducts } from '../state.js';
import { productRow, detailCard } from '../components.js';

const SORTS = ['popular', 'cheap', 'expensive', 'volume', 'name'];
const filters = { sort: 'popular', onlyNew: false, onlyAvailable: false, maxPrice: 0 };

function sortProducts(list) {
  const arr = [...list];
  switch (filters.sort) {
    case 'cheap': return arr.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
    case 'expensive': return arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case 'volume': return arr.sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0));
    case 'name': return arr.sort((a, b) => a.name.localeCompare(b.name, locale.current === 'en' ? 'en' : 'ru'));
    default:
      return arr.sort((a, b) => (Number(b.isHit) - Number(a.isHit)) || (Number(b.isNew) - Number(a.isNew)));
  }
}

export default function catalogView(params = {}) {
  let query = params.query || '';

  const prices = state.products.map((p) => p.price).filter((v) => Number.isFinite(v));
  const maxPrice = Math.max(...prices, 0);

  const container = h('div', { style: { paddingBottom: '20px' } });
  const countLabel = h('.tiny.muted-ink', { style: { padding: '10px 20px 0' } });

  function apply() {
    let allList = query ? searchProducts(query) : state.products;
    if (params.category) allList = allList.filter((p) => p.category === params.category);
    if (filters.onlyNew) allList = allList.filter((p) => p.isNew);
    if (filters.onlyAvailable) allList = allList.filter((p) => !p.outOfStock);
    if (filters.maxPrice) allList = allList.filter((p) => (p.price ?? maxPrice) <= filters.maxPrice);

    container.innerHTML = '';
    
    if (!allList.length) {
      container.append(emptyState({ emoji: '🔍', title: t('catalog.nothing'), text: t('catalog.nothingHint') }));
      countLabel.textContent = positionsLabel(0);
      return;
    }

    const wide = platform.form !== 'phone';
    let count = 0;
    for (const c of state.categories) {
      let list = allList.filter(p => p.category === c.id);
      if (list.length > 0) {
        list = sortProducts(list);
        count += list.length;
        container.append(
          h('div', { class: wide ? 'wide-cat' : '', style: { marginTop: '28px' } },
            h('.row-head', h('h2', c.title)),
            wide
              ? h('.dgrid', ...list.map((p) => detailCard(p)))
              : productRow(list, { fixedWidth: true })),
        );
      }
    }
    countLabel.textContent = positionsLabel(count);
  }

  const searchInput = h('input', { placeholder: t('catalog.searchPlaceholder'), value: query, type: 'search' });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    apply();
  });

  function openFilters() {
    const priceLabel = h('.cell-value', filters.maxPrice ? `${t('catalog.upto')} ${money(filters.maxPrice)}` : t('catalog.any'));
    const range = h('input', {
      type: 'range', min: 10, max: Math.ceil(maxPrice / 10) * 10, step: 5,
      value: filters.maxPrice || maxPrice,
      style: { width: '100%', accentColor: 'var(--accent)' },
    });
    range.addEventListener('input', () => {
      filters.maxPrice = Number(range.value) >= maxPrice ? 0 : Number(range.value);
      priceLabel.textContent = filters.maxPrice ? `${t('catalog.upto')} ${money(filters.maxPrice)}` : t('catalog.any');
    });

    const toggleRow = (title, key) => {
      const sw = h('.switch', { class: filters[key] ? 'on' : '' });
      const row = h('.cell', h('.cell-body', h('.cell-title', title)), sw);
      tap(row, () => {
        filters[key] = !filters[key];
        sw.classList.toggle('on', filters[key]);
      }, 'select');
      return row;
    };

    const sortCells = SORTS.map((id) => {
      const check = h('span', { style: { color: 'var(--accent)', opacity: filters.sort === id ? 1 : 0 }, html: icon('check', 18) });
      const row = h('.cell.tappable', h('.cell-body', h('.cell-title', t(`catalog.sort.${id}`))), check);
      tap(row, () => {
        filters.sort = id;
        for (const [i, el] of sortCells.entries()) {
          el.querySelector('span:last-child').style.opacity = SORTS[i] === id ? 1 : 0;
        }
      }, 'select');
      return row;
    });

    const body = h('div',
      h('.section-title', t('catalog.sort')),
      h('.group', ...sortCells),
      h('.section-title', { style: { marginTop: '18px' } }, t('catalog.filters')),
      h('.group',
        toggleRow(t('catalog.onlyNew'), 'onlyNew'),
        toggleRow(t('catalog.onlyAvailable'), 'onlyAvailable'),
        h('.cell', h('.cell-body', h('.cell-title', t('catalog.maxPrice'))), priceLabel)),
      h('div', { style: { padding: '12px 16px 0' } }, range),
    );

    const close = () => {
      modal.close();
      apply();
    };

    const modal = sheet({
      title: t('catalog.filters'),
      body,
      actions: h('div', { style: { display: 'flex', gap: '10px' } },
        tap(h('button.btn.secondary', t('catalog.reset')), () => {
          filters.onlyNew = false;
          filters.onlyAvailable = false;
          filters.maxPrice = 0;
          filters.sort = 'popular';
          close();
        }),
        tap(h('button.btn', t('common.save')), close)),
    });
  }

  apply();

  const content = h('div',
    h('div', { style: { padding: '10px 16px 0' } },
      h('.searchbar',
        h('span', { html: icon('search', 17) }),
        searchInput,
        tap(h('span', { html: icon('sliders', 19), style: { color: 'var(--accent)' } }), openFilters, 'select'))),
    countLabel,
    container
  );

  return {
    title: t('catalog.title'),
    tab: 'catalog',
    content,
    navRight: tap(h('button.nav-btn.icon', { html: icon('sliders', 21) }), openFilters, 'select'),
  };
}
