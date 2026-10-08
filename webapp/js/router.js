/** Навигация: стек экранов с iOS-переходами, навбар (с языком) и таб-бар. */
import { h, tap, t } from './ui.js';
import { icon } from './icons.js';
import { tg } from './tg.js';
import { state, subscribe, cartCount, switchLocale } from './state.js';
import { locale } from './i18n.js';

const routes = new Map();
const stack = [];

const screensEl = () => document.getElementById('screens');
const navbarEl = () => document.getElementById('navbar');
const tabbarEl = () => document.getElementById('tabbar');

/** Таб-бар собирается на каждом рендере, поэтому подписи берём через t(). */
export const TABS = () => [
  { id: 'home', title: t('tab.home'), icon: 'home', route: 'home' },
  { id: 'search', title: t('search.title'), icon: 'search', route: 'search' },
  { id: 'catalog', title: t('tab.catalog'), icon: 'plusCircle', route: 'catalog' },
  { id: 'cart', title: t('tab.cart'), icon: 'bag', route: 'cart' },
  { id: 'profile', title: t('tab.profile'), icon: 'person', route: 'profile' },
];

export function register(name, view) {
  routes.set(name, view);
}

export function current() {
  return stack[stack.length - 1] || null;
}

async function build(name, params) {
  const view = routes.get(name);
  if (!view) throw new Error(`Screen "${name}" is not registered`);
  const screen = h('.screen');
  const ctx = { screen, params, refresh: () => refresh() };
  const result = (await view(params, ctx)) || {};
  if (result.content) screen.append(result.content);
  if (result.classes) screen.classList.add(...result.classes);
  if (result.tabbar === false) screen.classList.add('no-tabbar');
  return { name, params, screen, ...result, ctx };
}

/** Переключатель языка в шапке: RU / EN. */
function languageSwitcher() {
  const btn = h('button.nav-btn.icon',
    h('span', { html: icon('globe', 20) }),
    h('span', { style: { fontSize: '13px', fontWeight: '600', letterSpacing: '0.04em' } },
      locale.current === 'ru' ? 'RU' : 'EN'));
  tap(btn, async () => {
    const next = locale.current === 'ru' ? 'en' : 'ru';
    await switchLocale(next);
    await refresh();
  }, 'select');
  return btn;
}

function desktopNavigation(entry) {
  const navigateTo = (route, tab) => navigate(route, {}, { replaceStack: true, tab });
  const link = (label, route, tab, active) => tap(
    h('button.desktop-link', { class: active ? 'active' : '', type: 'button' }, label),
    () => navigateTo(route, tab),
    'select',
  );
  const onCatalog = entry.name === 'catalog' || entry.name === 'search';
  const onAbout = entry.name === 'about' || entry.name === 'delivery';
  return h('.desktop-nav',
    tap(h('button.desktop-brand', { type: 'button' }, 'Cocktail Embassy'),
      () => navigateTo('home', 'home'), 'select'),
    h('.desktop-nav-links',
      link(locale.current === 'en' ? 'Shop' : 'Каталог', 'catalog', 'catalog', onCatalog),
      link(locale.current === 'en' ? 'Collections' : 'Коллекции', 'catalog', 'catalog', false),
      link(locale.current === 'en' ? 'About' : 'О бренде', 'about', 'profile', onAbout),
      tap(h('button.desktop-profile', {
        type: 'button',
        'aria-label': locale.current === 'en' ? 'Account' : 'Кабинет',
        html: icon('person', 20),
      }), () => navigateTo('profile', 'profile'), 'select')),
  );
}

function applyChrome(entry) {
  const nav = navbarEl();
  nav.innerHTML = '';
  nav.classList.toggle('transparent', Boolean(entry.transparentNav));
  nav.classList.remove('scrolled');

  const canGoBack = stack.length > 1;
  const left = h('.nav-side');
  if (entry.navLeft) left.append(entry.navLeft);
  else if (canGoBack && entry.navBack !== false) {
    left.append(tap(h('button.nav-btn', { html: `${icon('chevronLeft', 22)}<span>${t('common.back')}</span>` }), () => back(), 'light'));
  } else if (!canGoBack && entry.navLogo !== false) {
    left.append(h('img.nav-logo', { src: 'assets/brand/logo.svg', alt: 'Cocktail Embassy' }));
  }

  const title = h('.nav-title', entry.title || '');
  if (entry.hideTitleUntilScroll) title.classList.add('hidden');

  const right = h('.nav-side.right');
  if (entry.navRight) right.append(entry.navRight);
  if (entry.navLanguage !== false) right.append(languageSwitcher());

  nav.append(left, title, right, desktopNavigation(entry));

  entry.screen.onscroll = () => {
    const y = entry.screen.scrollTop;
    nav.classList.toggle('scrolled', y > 6);
    if (entry.hideTitleUntilScroll) title.classList.toggle('hidden', y < 40);
    entry.onScroll?.(y);
  };

  tg.backButton(canGoBack && entry.navBack !== false, () => back());
  renderTabbar(entry);
}

function renderTabbar(entry) {
  const bar = tabbarEl();
  const hidden = entry.tabbar === false;
  bar.classList.toggle('hidden', hidden);
  if (hidden) return;

  const requestedTab = entry.tab || stack[0]?.tab || 'home';
  const activeTab = requestedTab === 'favorites' ? 'profile' : requestedTab;
  bar.innerHTML = '';
  for (const tab of TABS()) {
    const badgeCount = tab.id === 'cart' ? cartCount() : 0;
    const el = h('button.tab', { class: tab.id === activeTab ? 'active' : '' },
      h('span', { html: icon(tab.icon, 26) }),
      h('span', tab.title),
      badgeCount ? h('.tab-badge', badgeCount > 99 ? '99+' : String(badgeCount)) : null,
    );
    tap(el, () => switchTab(tab), 'select');
    bar.append(el);
  }
}

function mount(entry, animation) {
  const host = screensEl();
  host.append(entry.screen);
  if (animation) entry.screen.classList.add(animation);
  applyChrome(entry);
  entry.onMount?.(entry.screen);
}

function unmount(entry, animation) {
  if (!entry) return;
  entry.onDestroy?.();
  const el = entry.screen;
  if (animation) {
    el.classList.add(animation);
    setTimeout(() => el.remove(), 340);
  } else el.remove();
}

export async function navigate(name, params = {}, options = {}) {
  const previous = current();
  const entry = await build(name, params);
  entry.tab = options.tab
    || (TABS().find((tab) => tab.route === name)?.id)
    || previous?.tab
    || 'home';

  if (options.replaceStack) {
    for (const item of stack) unmount(item);
    stack.length = 0;
    stack.push(entry);
    mount(entry, 'fade-in');
    return entry;
  }

  stack.push(entry);
  mount(entry, 'enter-push');
  if (previous) {
    previous.screen.classList.add('exit-push');
    setTimeout(() => {
      previous.screen.style.display = 'none';
      previous.screen.classList.remove('exit-push');
    }, 340);
  }
  return entry;
}

export function back() {
  if (stack.length < 2) {
    if (tg.inTelegram) tg.close();
    return;
  }
  const top = stack.pop();
  const prev = current();
  prev.screen.style.display = '';
  prev.screen.classList.add('enter-pop');
  setTimeout(() => prev.screen.classList.remove('enter-pop'), 340);
  applyChrome(prev);
  prev.onReturn?.();
  unmount(top, 'exit-pop');
}

export async function switchTab(tab) {
  const top = current();
  if (top?.tab === tab.id && stack.length === 1) {
    top.screen.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  await navigate(tab.route, {}, { replaceStack: true, tab: tab.id });
}

/** Полная перерисовка текущего экрана (после изменения данных или смены языка). */
export async function refresh() {
  const top = current();
  if (!top) return;
  const scrollY = top.screen.scrollTop;
  const rebuilt = await build(top.name, top.params);
  rebuilt.tab = top.tab;
  stack[stack.length - 1] = rebuilt;
  top.screen.replaceWith(rebuilt.screen);
  top.onDestroy?.();
  applyChrome(rebuilt);
  rebuilt.onMount?.(rebuilt.screen);
  rebuilt.screen.scrollTop = scrollY;
}

export function updateTabBadges() {
  const top = current();
  if (top) renderTabbar(top);
}

subscribe((event) => {
  if (event === 'cart') updateTabBadges();
});
