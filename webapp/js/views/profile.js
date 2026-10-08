/** Кабинет: статистика, заказы, язык, валюта, доставка, контакты. */
import { h, tap, section, cell, money, t, positionsLabel } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, refresh } from '../router.js';
import { tg } from '../tg.js';
import { locale } from '../i18n.js';
import { state, switchLocale, favoriteProducts, cartCount } from '../state.js';

export default function profileView() {
  const brand = state.config?.brand || {};
  const user = state.config?.user || {};
  const orders = state.orders || [];
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const spent = paid.reduce((sum, o) => sum + (o.total || 0), 0);
  const name = user.isGuest || !user.firstName
    ? t('profile.guest')
    : `${user.firstName} ${user.lastName || ''}`.trim();

  const langRow = h('.lang-row',
    tap(h('button.lang-btn', { class: locale.current === 'ru' ? 'active' : '' }, '🇷🇺 Русский'), async () => {
      await switchLocale('ru');
      await refresh();
    }),
    tap(h('button.lang-btn', { class: locale.current === 'en' ? 'active' : '' }, '🇬🇧 English'), async () => {
      await switchLocale('en');
      await refresh();
    }),
  );

  const contact = (label, value, iconName, onClick) => cell({
    title: label,
    sub: value,
    iconName,
    chevron: Boolean(onClick),
    onClick,
  });

  const openLink = (url) => () => {
    if (url.startsWith('https://t.me/') || url.startsWith('tg://')) tg.openTelegramLink(url);
    else tg.openLink(url);
  };

  const content = h('div',
    h('.profile-head',
      h('.profile-avatar', (brand.name || 'CE').split(' ').map((w) => w[0]).join('').slice(0, 2)),
      h('div',
        h('.profile-name', name),
        h('.profile-sub', user.isGuest
          ? t('profile.guestHint')
          : `${user.username ? `@${user.username} · ` : ''}${brand.city || 'Dubai'}`))),

    h('.stats',
      h('.stat', h('b', String(orders.length)), h('span', t('profile.stats.orders'))),
      h('.stat', h('b', money(spent).replace('AED ', '')), h('span', t('profile.stats.paid'))),
      h('.stat', h('b', String(favoriteProducts().length)), h('span', t('profile.stats.saved')))),

    section(t('profile.purchases'),
      h('.group',
        cell({ title: t('profile.myOrders'), sub: orders.length ? `${orders.length}` : '', iconName: 'box', chevron: true, onClick: () => navigate('orders') }),
        cell({ title: t('profile.favorites'), sub: positionsLabel(favoriteProducts().length), iconName: 'heart', chevron: true, onClick: () => navigate('favorites', {}, { replaceStack: true, tab: 'favorites' }) }),
        cell({ title: t('profile.support'), sub: state.config?.supportEnabled ? t('support.online') : '', iconName: 'chat', chevron: true, onClick: () => navigate('support') }))),

    section(t('profile.language'), h('.group', langRow)),
    section(t('profile.currency'), h('.group', cell({ title: t('profile.currency'), sub: t('profile.currencyValue'), iconName: 'tag' }))),

    section(t('profile.shop'),
      h('.group',
        cell({ title: t('profile.deliveryAndPayment'), iconName: 'truck', chevron: true, onClick: () => navigate('delivery') }),
        cell({ title: t('profile.about'), iconName: 'info', chevron: true, onClick: () => navigate('about') }))),

    section(t('profile.contacts'),
      h('.group',
        contact(t('profile.phone'), brand.phone || '', 'phone', brand.phone ? () => tg.openLink(`tel:${brand.phone.replace(/\s/g, '')}`) : null),
        contact(t('profile.whatsapp'), brand.whatsapp || '', 'chat', brand.whatsapp ? openLink(`https://wa.me/${brand.whatsapp.replace(/\D/g, '')}`) : null),
        contact(t('profile.email'), brand.email || '', 'doc', brand.email ? () => tg.openLink(`mailto:${brand.email}`) : null),
        contact(t('profile.instagram'), brand.instagram ? `@${brand.instagram}` : '', 'star',
          brand.instagram ? openLink(`https://instagram.com/${brand.instagram}`) : null),
        brand.telegram
          ? contact('Telegram', `@${brand.telegram}`, 'send', openLink(`https://t.me/${brand.telegram}`))
          : null,
        contact(t('profile.showroom'), brand.address || '', 'store'))),

    section(t('profile.contacts'),
      h('.group',
        h('.cell', { style: { display: 'block', padding: '14px' } },
          h('.cell-sub', { style: { lineHeight: '1.5' } }, t('profile.privacyText'))))),

    h('.brand-footer',
      h('img', { src: 'assets/brand/logo.svg', alt: brand.name || 'Cocktail Embassy' }),
      h('p.brand-footer-title', brand.name || 'Cocktail Embassy'),
      h('p', t('profile.footer')),
      h('p', brand.legalName || '')),
  );

  return {
    title: t('profile.title'),
    tab: 'profile',
    navLogo: false,
    content,
    navRight: cartCount()
      ? tap(h('button.nav-btn.icon', { html: icon('bag', 21) }), () => navigate('cart', {}, { replaceStack: true, tab: 'cart' }))
      : null,
  };
}
