/** Чат поддержки: сообщения уходят менеджерам в бот, ответы приходят сюда. */
import { h, tap, timeShort, dayLabel, toast, t } from '../ui.js';
import { icon } from '../icons.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { state } from '../state.js';

const QUICK_KEYS = ['support.q1', 'support.q2', 'support.q3', 'support.q4'];

export default function supportView({ prefill = '' } = {}) {
  const body = h('.chat-body');
  const textarea = h('textarea', { placeholder: t('support.placeholder'), rows: 1, value: prefill });
  const sendBtn = h('button.chat-send', { html: icon('send', 19), disabled: !prefill.trim() });

  let lastAt = 0;
  let poll = null;
  let lastDay = '';

  function appendMessage(m, animate = true) {
    const day = dayLabel(m.at);
    if (day !== lastDay) {
      lastDay = day;
      body.append(h('.chat-day', day));
    }
    const cls = m.from === 'user' ? 'out' : m.from === 'system' ? 'system' : 'in';
    const bubble = h('.bubble', { class: cls },
      h('span', m.text),
      m.from === 'system' ? null : h('span.bubble-time', timeShort(m.at)));
    if (!animate) bubble.style.animation = 'none';
    body.append(bubble);
    lastAt = Math.max(lastAt, m.at);
  }

  function scrollDown(smooth = false) {
    body.scrollTo({ top: body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  async function load() {
    try {
      const res = await api.support();
      body.innerHTML = '';
      lastDay = '';
      if (!res.messages.length) {
        body.append(h('.bubble.system', t('support.hello')));
        body.append(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '7px', justifyContent: 'center', margin: '10px 0' } },
          ...QUICK_KEYS.map((key) => tap(h('button.pill', t(key)), () => {
            textarea.value = t(key);
            sendBtn.disabled = false;
            send();
          }))));
      } else {
        for (const m of res.messages) appendMessage(m, false);
      }
      scrollDown();
    } catch (err) {
      body.append(h('.bubble.system', t('support.failed', { error: err.message })));
    }
  }

  async function send() {
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;
    appendMessage({ from: 'user', text, at: Date.now() });
    scrollDown(true);
    tg.haptic('light');
    try {
      await api.sendSupport(text);
    } catch (err) {
      toast(t('support.notSent', { error: err.message }), 3000);
    }
  }

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
    sendBtn.disabled = !textarea.value.trim();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  });
  tap(sendBtn, send);

  async function pollUpdates() {
    try {
      const res = await api.supportUpdates(lastAt);
      for (const m of res.messages) {
        if (m.from === 'user') continue;
        appendMessage(m);
        tg.haptic('light');
      }
      if (res.messages.some((m) => m.from !== 'user')) scrollDown(true);
    } catch {}
  }

  const composer = h('.chat-composer', textarea, sendBtn);

  return {
    title: t('support.title'),
    tabbar: false,
    classes: ['chat-screen'],
    content: h('div', body),
    onMount: () => {
      document.body.append(composer);
      load();
      poll = setInterval(pollUpdates, 5000);
      if (tg.inTelegram) tg.mainButton({ visible: false });
      document.querySelector('.chat-screen')?.style.setProperty('padding-bottom', '86px');
    },
    onDestroy: () => {
      clearInterval(poll);
      composer.remove();
      tg.hideMainButton();
    },
  };
}

export { state };
