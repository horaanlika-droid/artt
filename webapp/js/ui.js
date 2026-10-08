/** Мини-хелперы для DOM, форматирования и всплывающих элементов. */
import { tg } from './tg.js';
import { icon } from './icons.js';
import { locale, t, money, moneyShort, usdHint } from './i18n.js';

export { money, moneyShort, usdHint, t };

const glintTimers = new WeakMap();

/** Повторяемый блик на фото товара при добавлении в корзину. */
export function glint(element) {
  if (!element) return;
  const activeTimer = glintTimers.get(element);
  if (activeTimer) clearTimeout(activeTimer);
  element.classList.remove('glass-glint');
  // Перезапуск CSS-анимации даже при быстрых повторных нажатиях.
  void element.offsetWidth;
  element.classList.add('glass-glint');
  glintTimers.set(element, setTimeout(() => {
    element.classList.remove('glass-glint');
    glintTimers.delete(element);
  }, 1050));
}

/** Создание элемента: h('div.class#id', {props}, children...) */
export function h(spec, props = null, ...children) {
  let tag = 'div';
  const classes = [];
  let id = '';
  const m = String(spec).match(/^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/);
  if (m) {
    tag = m[1] || 'div';
    for (const token of (m[2] || '').match(/[.#][\w-]+/g) || []) {
      if (token[0] === '.') classes.push(token.slice(1));
      else id = token.slice(1);
    }
  }
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  if (id) el.id = id;

  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in el && key !== 'list') {
        try { el[key] = value; } catch { el.setAttribute(key, value); }
      } else el.setAttribute(key, value);
    }
  } else if (props !== null && props !== undefined) {
    children.unshift(props);
  }

  const append = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) return child.forEach(append);
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  };
  children.forEach(append);
  return el;
}

export function appendAll(parent, ...children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export const frag = (...nodes) => {
  const f = document.createDocumentFragment();
  nodes.flat().filter(Boolean).forEach((n) => f.append(n));
  return f;
};

/** Кнопка с тактильной отдачей. */
export function tap(el, handler, haptic = 'light') {
  el.addEventListener('click', (e) => {
    tg.haptic(haptic);
    handler(e);
  });
  return el;
}

// ── форматирование ────────────────────────────────────────────
export function positionsLabel(count) {
  if (locale.current === 'en') return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
  const n10 = count % 10;
  const n100 = count % 100;
  const form = n10 === 1 && n100 !== 11 ? 'позиция'
    : n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20) ? 'позиции' : 'позиций';
  return `${count} ${form}`;
}

const dateLocale = () => (locale.current === 'en' ? 'en-GB' : 'ru-RU');

export function dateShort(ts) {
  return new Date(ts).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' });
}

export function timeShort(ts) {
  return new Date(ts).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return locale.current === 'en' ? 'Today' : 'Сегодня';
  if (same(d, yest)) return locale.current === 'en' ? 'Yesterday' : 'Вчера';
  return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' });
}

// ── тосты ─────────────────────────────────────────────────────
export function toast(message, ms = 2000) {
  const host = document.getElementById('toast-host');
  const el = h('.toast', { text: message });
  host.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ── нижняя шторка ─────────────────────────────────────────────
export function sheet({ title, body, actions }) {
  const host = document.getElementById('overlays');
  host.style.pointerEvents = 'auto';

  const backdrop = h('.backdrop');
  const close = () => {
    backdrop.classList.remove('show');
    panel.classList.remove('show');
    setTimeout(() => {
      backdrop.remove();
      panel.remove();
      if (!host.children.length) host.style.pointerEvents = 'none';
    }, 340);
  };

  const panel = h('.sheet',
    h('.sheet-grabber'),
    title
      ? h('.sheet-head',
        h('.sheet-title', title),
        tap(h('button.nav-btn.icon', { html: icon('close', 20) }), () => close()))
      : null,
    h('.sheet-body', body),
    actions ? h('div', { style: { padding: '4px 16px 12px' } }, actions) : null,
  );

  backdrop.addEventListener('click', close);
  host.append(backdrop, panel);
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    panel.classList.add('show');
  });
  return { close, panel };
}

export async function confirmDialog({ title, message, okText = 'OK', destructive = false }) {
  if (tg.raw?.showPopup) {
    const id = await tg.popup({
      title,
      message,
      buttons: [
        { id: 'ok', type: destructive ? 'destructive' : 'default', text: okText },
        { id: 'cancel', type: 'cancel' },
      ],
    });
    return id === 'ok';
  }
  return window.confirm(`${title ? `${title}\n\n` : ''}${message}`);
}

// ── общие блоки ───────────────────────────────────────────────
export function section(titleText, ...content) {
  return h('.section', titleText ? h('.section-title', titleText) : null, ...content);
}

export function group(...cells) {
  return h('.group', ...cells.flat().filter(Boolean));
}

export function cell({ title, sub, value, iconName, chevron = false, onClick, right, danger = false }) {
  const el = h('.cell',
    iconName ? h('.cell-icon', { html: icon(iconName, 18) }) : null,
    h('.cell-body',
      h('.cell-title', { style: danger ? { color: 'var(--red)' } : {} }, title),
      sub ? h('.cell-sub', sub) : null),
    value ? h('.cell-value', value) : null,
    right || null,
    chevron ? h('.cell-chevron', { html: icon('chevron', 14) }) : null,
  );
  if (onClick) {
    el.classList.add('tappable');
    tap(el, onClick, 'select');
  }
  return el;
}

export function field({ label, placeholder, value = '', type = 'text', onInput, multiline = false, inputmode, name }) {
  const input = multiline
    ? h('textarea', { placeholder, rows: 3, value, name })
    : h('input', { placeholder, type, value, name, inputmode: inputmode || undefined, autocomplete: 'off', autocapitalize: type === 'email' ? 'off' : 'sentences' });
  if (onInput) input.addEventListener('input', () => onInput(input.value, input));
  const wrap = h('.field', label ? h('label', label) : null, input);
  wrap.input = input;
  return wrap;
}

export function emptyState({ emoji = '✨', title, text, action }) {
  return h('.empty', h('.emoji', emoji), h('h3', title), text ? h('p', text) : null, action || null);
}

export function spinnerBlock(text) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '60px 0' } },
    h('.spinner'), text ? h('.tiny.muted-ink', text) : null);
}

export function skeletonGrid(count = 6) {
  return h('.product-grid', ...Array.from({ length: count }, () => h('.skeleton.skeleton-card')));
}
