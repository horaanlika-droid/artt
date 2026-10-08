/** О бренде: текст, контакты, менеджеры, валюта и язык. */
import { h, section, cell, tap, t } from '../ui.js';
import { icon } from '../icons.js';
import { tg } from '../tg.js';
import { navigate, refresh } from '../router.js';
import { locale } from '../i18n.js';
import { state, switchLocale } from '../state.js';

export default function aboutView() {
  const brand = state.config?.brand || {};

  const openLink = (url) => () => {
    if (url.startsWith('https://t.me/')) tg.openTelegramLink(url);
    else tg.openLink(url);
  };

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

  const content = h('div', { style: { paddingTop: '10px' } },
    h('.pd-gallery', { style: { minHeight: '200px' } },
      h('img', { src: 'assets/brand/logo.svg', style: { maxHeight: '120px' }, alt: brand.name || '' })),

    h('.pd-head',
      h('.pd-collection', `${brand.city || 'Dubai'}, ${brand.country || 'UAE'}`),
      h('h1.pd-name', { style: { fontSize: '27px' } }, brand.name || 'Cocktail Embassy'),
      h('div', { style: { fontSize: '14px', color: 'var(--ink-3)' } }, brand.tagline || '')),

    h('.pd-desc', brand.about || ''),

    section(t('profile.contacts'),
      h('.group',
        brand.phone ? cell({ title: t('profile.phone'), sub: brand.phone, iconName: 'phone', chevron: true, onClick: () => tg.openLink(`tel:${brand.phone.replace(/\s/g, '')}`) }) : null,
        brand.whatsapp ? cell({ title: t('profile.whatsapp'), sub: brand.whatsapp, iconName: 'chat', chevron: true, onClick: openLink(`https://wa.me/${String(brand.whatsapp).replace(/\D/g, '')}`) }) : null,
        brand.email ? cell({ title: t('profile.email'), sub: brand.email, iconName: 'doc', chevron: true, onClick: () => tg.openLink(`mailto:${brand.email}`) }) : null,
        brand.instagram ? cell({ title: t('profile.instagram'), sub: `@${brand.instagram}`, iconName: 'star', chevron: true, onClick: openLink(`https://instagram.com/${brand.instagram}`) }) : null,
        brand.address ? cell({ title: t('profile.showroom'), sub: brand.address, iconName: 'store' }) : null)),

    (brand.managers || []).length ? section(t('profile.manager'),
      h('.group', ...brand.managers.map((m) => cell({
        title: m.name || t('profile.manager'),
        sub: [m.region, m.phone].filter(Boolean).join(' · '),
        iconName: 'person',
        chevron: Boolean(m.phone || m.whatsapp),
        onClick: m.whatsapp ? openLink(`https://wa.me/${String(m.whatsapp).replace(/\D/g, '')}`) : null,
      })))) : null,

    section(t('profile.language'), h('.group', langRow)),
    section('', h('.group', cell({ title: t('profile.deliveryAndPayment'), iconName: 'truck', chevron: true, onClick: () => navigate('delivery') }))),

    h('.section-footer', { style: { padding: '16px 20px 30px' } }, t('profile.footer')),
  );

  return { title: t('profile.about'), tabbar: false, content };
}
