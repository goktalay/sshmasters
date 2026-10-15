'use strict';

// Ortak arayüz yardımcıları (ana pencere ve terminal penceresi)

// --- Dil ------------------------------------------------------------------------
const LANG = window.api.lang || 'en';
const t = I18N.createT(LANG);
document.documentElement.lang = LANG;
document.documentElement.dir = (I18N.LANGUAGES[LANG] || {}).dir || 'ltr';

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  move: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  home: '<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  bolt: '<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13 7.5 5h9L19 13M7 16.5h.01"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  columns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  rows: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  cloudOff: '<path d="M3 3l18 18M8.5 5.4A6 6 0 0 1 18 9a4.5 4.5 0 0 1 2.4 8.3M15 18H7a5 5 0 0 1-1.6-9.7"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  reconnect:'<path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 10a8 8 0 0 0-14.3-4.3L4 10M4 14a8 8 0 0 0 14.3 4.3L20 14"/>',
};

function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatSize(n) {
  if (n == null) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  // LRI…PDI: sağdan sola dillerde "400 MB" ters ("MB 400") görünmesin
  return `⁦${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}⁩`;
}

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(LANG, { dateStyle: 'short', timeStyle: 'short' });
}

function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

// --- Bağlam menüsü ------------------------------------------------------------
let activeCtx = null;
function closeContextMenu() {
  if (activeCtx) { activeCtx.remove(); activeCtx = null; }
}
function contextMenu(x, y, items) {
  closeContextMenu();
  const menu = h('<div class="ctx"></div>');
  for (const it of items) {
    if (it === '-') { menu.appendChild(h('<hr>')); continue; }
    if (!it) continue;
    const b = h(`<button class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.kbd ? `<span class="kbd">${esc(it.kbd)}</span>` : ''}</button>`);
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => { closeContextMenu(); it.action(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  activeCtx = menu;
}
window.addEventListener('mousedown', (e) => { if (activeCtx && !activeCtx.contains(e.target)) closeContextMenu(); }, true);
window.addEventListener('blur', closeContextMenu);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenu(); });

// --- Bildirimler --------------------------------------------------------------
function toastHost() {
  let el = document.querySelector('.toasts');
  if (!el) { el = h('<div class="toasts"></div>'); document.body.appendChild(el); }
  return el;
}
function toast(title, { type = '', sub = '', timeout = 3500 } = {}) {
  const el = h(`<div class="toast ${type}"><div class="t-body"><div class="t-title">${esc(title)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}</div></div>`);
  toastHost().appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// --- Modal --------------------------------------------------------------------
function openModal({ title, iconName, body, buttons = [], width, onMount }) {
  return new Promise((resolve) => {
    const back = h('<div class="modal-backdrop"></div>');
    const modal = h(`<div class="modal">
      <header>${iconName ? `<span style="color:var(--accent)">${icon(iconName)}</span>` : ''}<h2>${esc(title)}</h2></header>
      <div class="body"></div><footer><span class="spacer"></span></footer></div>`);
    if (width) modal.style.width = `min(${width}px, calc(100vw - 32px))`;
    const bodyEl = modal.querySelector('.body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const footer = modal.querySelector('footer');
    const close = (val) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    for (const b of buttons) {
      const btn = h(`<button class="btn ${b.cls || ''}">${b.icon ? icon(b.icon) : ''}${esc(b.label)}</button>`);
      btn.addEventListener('click', async () => {
        if (b.onClick) {
          const r = await b.onClick(modal, btn);
          if (r === false) return;
          close(r === undefined ? b.value : r);
        } else close(b.value);
      });
      if (b.left) footer.insertBefore(btn, footer.querySelector('.spacer')); else footer.appendChild(btn);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const primary = [...footer.querySelectorAll('.btn.primary')].pop();
        if (primary) { e.preventDefault(); primary.click(); }
      }
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    back.appendChild(modal);
    document.body.appendChild(back);
    if (onMount) onMount(modal, close);
    const first = modal.querySelector('input:not([type=checkbox]),textarea,select');
    if (first) setTimeout(() => first.focus(), 30);
  });
}

async function prompt(title, { label = '', value = '', placeholder = '', okText = t('common.ok'), iconName = 'edit' } = {}) {
  return openModal({
    title, iconName,
    body: `<div class="field"><label>${esc(label)}</label><input class="input" id="pv" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
    buttons: [
      { label: t('common.cancel'), value: null },
      { label: okText, cls: 'primary', onClick: (m) => { const v = m.querySelector('#pv').value.trim(); if (!v) { m.querySelector('#pv').classList.add('invalid'); return false; } return v; } },
    ],
    onMount: (m) => { const i = m.querySelector('#pv'); setTimeout(() => i.select(), 40); },
  });
}

async function confirmBox(title, message, { okText = t('common.delete'), danger = true } = {}) {
  return openModal({
    title, iconName: danger ? 'trash' : 'check',
    body: `<div style="color:var(--text-2);line-height:1.5">${message}</div>`,
    buttons: [
      { label: t('common.giveUp'), value: false },
      { label: okText, cls: danger ? 'primary danger-primary' : 'primary', value: true },
    ],
  });
}
