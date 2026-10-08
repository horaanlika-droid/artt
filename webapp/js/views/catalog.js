/** Каталог: коллекции-чипсы, поиск, сортировка и фильтры. */
import { h, tap, sheet, money, emptyState, t, positionsLabel } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { locale } from '../i18n.js';
import { state, searchProducts } from '../state.js';
import { productCard } from '../components.js';

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
  let activeCategory = params.category || 'all';
  let query = params.query || '';

  const grid = h('.product-grid');
  const countLabel = h('.tiny.muted-ink', { style: { padding: '10px 20px 0' } });
  const prices = state.products.map((p) => p.price).filter((v) => Number.isFinite(v));
  const maxPrice = Math.max(...prices, 0);

  function apply() {
    let list = query ? searchProducts(query) : state.products;
    if (activeCategory !== 'all') list = list.filter((p) => p.category === activeCategory);
    if (filters.onlyNew) list = list.filter((p) => p.isNew);
    if (filters.onlyAvailable) list = list.filter((p) => !p.outOfStock);
    if (filters.maxPrice) list = list.filter((p) => (p.price ?? maxPrice) <= filters.maxPrice);
    list = sortProducts(list);

    grid.innerHTML = '';
    if (!list.length) {
      grid.style.display = 'block';
      grid.append(emptyState({ emoji: '🔍', title: t('catalog.nothing'), text: t('catalog.nothingHint') }));
    } else {
      grid.style.display = '';
      for (const p of list) grid.append(productCard(p));
    }
    countLabel.textContent = positionsLabel(list.length);
  }

  const chips = h('.chips');
  const chipEls = new Map();
  const makeChip = (id, title) => {
    const el = h('button.pill', { class: activeCategory === id ? 'active' : '' }, title);
    tap(el, () => {
      activeCategory = id;
      for (const [key, node] of chipEls) node.classList.toggle('active', key === id);
      apply();
      document.querySelector('.screen')?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 'select');
    chipEls.set(id, el);
    return el;
  };
  chips.append(makeChip('all', t('common.all')));
  for (const c of state.categories) chips.append(makeChip(c.id, c.title));

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
    chips,
    countLabel,
    grid,
    h('div', { style: { height: '20px' } }),
  );

  return {
    title: t('catalog.title'),
    tab: 'catalog',
    content,
    navRight: tap(h('button.nav-btn.icon', { html: icon('sliders', 21) }), openFilters, 'select'),
  };
}
