/**
 * Платформа и форм-фактор витрины.
 *
 * Дизайн адаптивный, но осознанно разный по платформам — как нативные версии:
 *  - iOS (iPhone): SF-типографика, полупрозрачный таб-бар с подписями, safe-area;
 *  - iPad: та же визуальная система iOS, но широкая сетка и верхняя навигация;
 *  - Android: Roboto и Material-таб-бар с pill-индикатором активной вкладки;
 *  - Desktop: полноценный сайт — верхнее меню, hero с коллекциями, панель корзины.
 *
 * Источник правды о платформе — Telegram WebApp.platform, вне Telegram — user agent.
 * Форм-фактор (phone / tablet / desktop) решается по размеру экрана и типу указателя:
 * планшет с широким экраном остаётся tablet (iPad Pro в альбомной ориентации),
 * desktop — только тонкий указатель (мышь/трекпад).
 */
const wa = window.Telegram?.WebApp;
const ua = navigator.userAgent || '';

const iosUA = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const androidUA = /Android/.test(ua);

function detectPlatform() {
  const tgPlatform = String(wa?.platform || '').toLowerCase();
  if (tgPlatform === 'android' || (!wa && androidUA)) return 'android';
  if (tgPlatform === 'ios' || tgPlatform === 'macos' || (!wa && iosUA)) return 'ios';
  if (wa) return 'android' === tgPlatform ? 'android' : 'ios'; // в Telegram всегда мобильная платформа
  return 'desktop';
}

function detectForm(platformName) {
  const wide = window.innerWidth >= 1200;
  const mid = window.innerWidth >= 768;
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
  if (wide && fine && platformName === 'desktop') return 'desktop';
  if (mid) return 'tablet';
  return 'phone';
}

export const platform = {
  name: detectPlatform(),
  form: null,

  apply() {
    this.form = detectForm(this.name);
    const root = document.documentElement;
    root.dataset.platform = this.name;
    root.dataset.form = this.form;
    root.dataset.device = this.name === 'android' ? 'android'
      : this.form === 'tablet' ? 'ipad'
        : this.name === 'ios' ? 'iphone' : 'desktop';
  },
};

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => platform.apply(), 120);
});
window.addEventListener('orientationchange', () => platform.apply());

platform.apply();
