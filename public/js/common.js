'use strict';
/* أدوات مشتركة بين لوحة العميل ولوحة المدير */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  plate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h3M6 14h3M13 10v4M16 10v4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="4"/></svg>',
  gate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5M4 9l16-4M4 9l16 0"/><circle cx="4" cy="5" r="1.5"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0v-5l2-5h14l4 5v5a2 2 0 1 1-4 0"/><circle cx="6.5" cy="17" r="2"/><circle cx="17.5" cy="17" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
  question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !url.includes('/login')) { location.href = '/login'; throw new Error('401'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || 'حدث خطأ');
  return data;
}

function toast(msg, err = false) {
  $$('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { if (e.message !== '401') toast(e.message, true); }
}

// ---------- الأرقام والأحرف ----------
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_TO_AR = { A: 'ا', B: 'ب', J: 'ح', D: 'د', R: 'ر', S: 'س', X: 'ص', T: 'ط', E: 'ع', G: 'ق', K: 'ك', L: 'ل', Z: 'م', N: 'ن', H: 'هـ', U: 'و', V: 'ى' };
const toAr = (s) => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[d]);

// رسم اللوحة السعودية: الأرقام يساراً والأحرف يميناً، العربي أعلى والإنجليزي أسفل
function plateHTML(key, opts = {}) {
  const k = String(key || '');
  const letters = k.replace(/[0-9]/g, '');
  const digits = k.replace(/[^0-9]/g, '');
  const isSA = letters.length >= 1 && letters.length <= 3 && digits.length >= 1 && digits.length <= 4 && [...letters].every((c) => EN_TO_AR[c]);
  if (!isSA) return `<span class="plate other ${opts.lg ? 'lg' : ''}">${esc(opts.raw || k || '—')}</span>`;
  const arLetters = [...letters].map((c) => EN_TO_AR[c]).reverse().join(' ');
  return `<span class="plate ${opts.lg ? 'lg' : ''}" title="${esc(opts.raw || '')}">
    <span class="cell"><span>${toAr(digits)}</span><span>${digits}</span></span>
    <span class="cell"><span>${arLetters}</span><span>${[...letters].join(' ')}</span></span>
    <span class="ksa">KSA</span></span>`;
}

const STATUS = {
  allow: ['allow', 'مسموح'], block: ['block', 'محظور'], unknown: ['unknown', 'غير مسجل'], expired: ['expired', 'منتهي'],
};
const statusBadge = (s) => { const [c, t] = STATUS[s] || STATUS.unknown; return `<span class="badge ${c}">${t}</span>`; };

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function ago(ts) {
  if (!ts) return 'لم يتصل بعد';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.round(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.round(s / 3600)} س`;
  return `قبل ${Math.round(s / 86400)} يوم`;
}

function readItem(r, opts = {}) {
  const img = r.image ? `<img class="thumb" loading="lazy" src="/api/images/${esc(r.image)}" data-full="/api/images/${esc(r.image)}" alt="">` : '';
  return `<div class="item ${opts.isNew ? 'new' : ''}" data-plate="${esc(r.plate_raw)}">
    ${plateHTML(r.plate_key, { raw: r.plate_raw })}
    <div class="info">
      <div class="t">${esc(r.device_name || r.serial)}${opts.showCustomer && r.customer_name ? ` · <span class="muted">${esc(r.customer_name)}</span>` : ''}</div>
      <div class="s">${fmtDate(r.ts)}${r.gate_opened ? ' · فُتحت البوابة' : ''}${r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ''}</div>
    </div>
    ${statusBadge(r.list_status)} ${img}
  </div>`;
}

// ---------- النوافذ ----------
function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(bg);
  onMount?.(bg.firstElementChild, close);
  return close;
}
function confirmBox(msg, okText = 'تأكيد') {
  return new Promise((resolve) => {
    modal(`<h3>${esc(msg)}</h3><div class="actions"><button class="btn" data-close>إلغاء</button><button class="btn primary" id="ok">${esc(okText)}</button></div>`,
      (m, close) => { $('#ok', m).onclick = () => { close(); resolve(true); }; m.parentElement.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m.parentElement) resolve(false); }); });
  });
}
function formData(form) {
  const o = {};
  for (const el of form.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value.trim();
  return o;
}

document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-full]');
  if (img) modal(`<img class="full" src="${img.dataset.full}" alt=""><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
});

// ---------- التبويبات ----------
function setupTabs(tabs, onChange) {
  const bar = $('.tabbar');
  bar.innerHTML = tabs.map((t) => `<button data-tab="${t.id}">${ICONS[t.icon]}<span>${t.label}</span></button>`).join('');
  const show = (id) => {
    if (!tabs.find((t) => t.id === id)) id = tabs[0].id;
    $$('[data-view]').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== id));
    $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    $('#page-title').textContent = tabs.find((t) => t.id === id).title || tabs.find((t) => t.id === id).label;
    history.replaceState(null, '', '#' + id);
    window.scrollTo(0, 0);
    onChange(id);
  };
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  show(location.hash.slice(1));
  return show;
}

// ---------- الأحداث المباشرة ----------
function live(handlers) {
  let es;
  const connect = () => {
    es = new EventSource('/api/events');
    es.onopen = () => $('.live-dot')?.classList.add('on');
    es.onerror = () => $('.live-dot')?.classList.remove('on');
    for (const [type, fn] of Object.entries(handlers)) es.addEventListener(type, (e) => fn(JSON.parse(e.data)));
  };
  connect();
}

// إشعار صوتي + إشعار المتصفح للمركبات المحظورة
function notify(title, body) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch { /* لا يوجد صوت */ }
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, icon: '/icons/icon.svg', dir: 'rtl', lang: 'ar' }))
      .catch(() => new Notification(title, { body }));
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  location.href = '/login';
}

function bars(el, hours) {
  const max = Math.max(1, ...hours);
  el.innerHTML = `<div class="bars">${hours.map((n, h) => `<div style="height:${(n / max) * 100}%" title="${h}:00 — ${n}"></div>`).join('')}</div>
    <div class="bars-x"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>`;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// السمة الداكنة/الفاتحة
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* */ }
function toggleTheme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = document.documentElement.dataset.theme || (dark ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* */ }
}
