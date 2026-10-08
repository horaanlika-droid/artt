/**
 * Screenshot QA: снимки ключевых экранов в headless Chromium (спартиц, Amazon-Linux-libs).
 *
 * Запуск:  npm run qa            # все экраны → /tmp/shot_*.png
 *          npm run qa -- product # только экраны, чьё имя содержит "product"
 *
 * Сервер должен работать:  npm run web   (MODE=web node src/index.js, порт 3000).
 * На не-AL2023 хостах нужны системные libnspr4/libnss3 — пакет @sparticuz/chromium
 * кладёт их в /tmp/al2023/lib, тогда:  LD_LIBRARY_PATH=/tmp/al2023/lib npm run qa
 */
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const OUT = process.env.QA_OUT || '/tmp';
const filter = (process.argv[2] || '').toLowerCase();
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--hide-scrollbars', '--font-render-hinting=none'],
  headless: 'shell',
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Открывает страницу и ждёт сетку/сети. Возвращает page. */
async function open(width, height, url, dpr = 2) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.log(`[qa] PAGEERROR: ${e.message}`));
  await p.setViewport({ width, height, deviceScaleFactor: dpr });
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch((e) =>
    console.log(`[qa] goto ${url}: ${e.message}`),
  );
  await wait(1300);
  return p;
}
/** Реальный клик по первому .pcard (карточка товара). */
const clickFirstCard = (p) => p.evaluate(() => {
  const c = document.querySelector('.pcard, [class*="pcard"]');
  if (c) c.click();
  return Boolean(c);
});
/** Клик по кнопке, чей текст совпадает с регуляркой (строка без флагов). */
const clickBy = (p, src) => p.evaluate((s) => {
  const rx = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find((x) =>
    rx.test((x.textContent || '').replace(/\s+/g, ' ')) && x.offsetParent);
  if (b) b.click();
  return b ? (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null;
}, src);
/** Клик по вкладке таб-бара по точному тексту подписи (бейдж в .tab-ico ломает textContent кнопки). */
const clickTab = (p, label) => p.evaluate((lab) => {
  const b = [...document.querySelectorAll('button.tab')].find(
    (x) => (x.querySelector('.tab-label')?.textContent || '').trim() === lab);
  if (b) b.click();
  return b ? 'tab:' + lab : null;
}, label);
/** Скролл экрана (scroller — .screen, не window). */
const scrollScreen = (p, y) => p.evaluate((yy) => {
  const s = document.querySelector('.screen') || document.scrollingElement;
  s.scrollTo({ top: yy });
}, y);

async function shot(name, fn) {
  if (filter && !name.toLowerCase().includes(filter)) return;
  const p = await fn();
  await p.screenshot({ path: `${OUT}/shot_${name}.png` });
  await p.close();
  console.log(`[qa] saved ${OUT}/shot_${name}.png`);
}

await shot('home-mobile', async () => open(390, 844, `${BASE}/`));
await shot('home-mobile-lower', async () => {
  const p = await open(390, 844, `${BASE}/`);
  await scrollScreen(p, 760);
  await wait(800);
  return p;
});
await shot('home-desktop', async () => open(1440, 900, `${BASE}/`));
await shot('catalog-mobile', async () => {
  const p = await open(390, 844, `${BASE}/`);
  await clickTab(p, 'Коллекция') || (await clickTab(p, 'Collection'));
  await wait(1200);
  return p;
});
await shot('catalog-desktop', async () => {
  const p = await open(1440, 900, `${BASE}/`);
  const nav = await clickBy(p, '^(Коллекции|Collections)$');
  if (!nav) { await clickTab(p, 'Коллекция') || (await clickTab(p, 'Collection')); }
  await wait(1200);
  return p;
});
await shot('product-mobile', async () => {
  const p = await open(390, 844, `${BASE}/`);
  await clickFirstCard(p);
  await wait(1400);
  return p;
});
await shot('product-desktop', async () => {
  const p = await open(1440, 900, `${BASE}/`);
  await clickFirstCard(p);
  await wait(1400);
  return p;
});
await shot('cart-mobile', async () => {
  const p = await open(390, 844, `${BASE}/`);
  await clickFirstCard(p);
  await wait(1400);
  await clickBy(p, 'В корзину|Add to cart');
  await wait(700);
  await clickTab(p, 'Корзина') || (await clickTab(p, 'Cart'));
  await wait(1200);
  return p;
});

await browser.close();
console.log('[qa] done');
