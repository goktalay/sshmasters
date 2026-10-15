'use strict';

// Terminal penceresi: bölünebilir SSH konsolları (her bölme ayrı oturum)
// + sol panel (kısayollar, sunucu dosyaları, yerel dosyalar). Sol panel aktif bölmeye bağlıdır.

const $ = (s) => document.querySelector(s);
// Not: `api` preload tarafından global olarak tanımlanır (window.api)

let data = { shortcuts: [], settings: {}, connections: [] };
let syncInput = false;

const MAX_PANES = 6;
const panes = new Map(); // paneId -> Pane
let active = null;
let root = null;         // bölme ağacı: { type:'pane', pane } | { type:'split', dir:'row'|'col', a, b, ratio }
let paneSeq = 0;

const focusActive = () => active && active.term.focus();
const IS_RTL = document.documentElement.dir === 'rtl';

// =============================================================================
// Bölme (pane): bir xterm + bir SSH oturumu
// =============================================================================
class Pane {
  constructor(connId) {
    this.id = 'p' + ++paneSeq;
    this.connId = connId;
    this.connected = false;
    this.connecting = false;
    this.termCwd = null;   // terminalin bildirdiği klasör (OSC 7)
    this.remoteCwd = null; // dosya yöneticisinde bu bölme için açık klasör
    this.home = null;
    const c = this.conn;

    this.el = h(`<div class="pane" style="--c:${esc(c?.color || '#22d3ee')}">
      <div class="pane-head">
        <button class="icon-btn sb-toggle" data-a="sidebar" title="${esc(t('pane.toggleSidebar'))}">${icon('sidebar')}</button>
        <span class="status-dot"></span>
        <span class="pane-name">${esc(c?.name || t('pane.defaultName'))}</span>
        <span class="pane-sub">${esc(c ? `${c.username}@${c.host}` : '')}</span>
        <span class="pane-actions">
          <button class="icon-btn" data-a="theme" title="${esc(t('palette.title'))}">${icon('palette')}</button>
          <button class="icon-btn" data-a="right" title="${esc(t('pane.splitRight'))} (Ctrl+Shift+E)">${icon('columns')}</button>
          <button class="icon-btn" data-a="down" title="${esc(t('pane.splitDown'))} (Ctrl+Shift+O)">${icon('rows')}</button>
          <button class="icon-btn" data-a="reconnect" title="${esc(t('pane.reconnect'))}">${icon('reconnect')}</button>
          <button class="icon-btn close" data-a="close" title="${esc(t('pane.close'))} (Ctrl+Shift+W)">${icon('x')}</button>
        </span>
      </div>
      <div class="pane-body"><div class="pane-term"><div class="xterm-host"></div></div></div>
    </div>`);

    // Her bölmenin kendi sol paneli (kısayollar, sunucu dosyaları, bilgisayarım)
    this.sb = new Sidebar(this);
    this.sb.mount(this.el.querySelector('.pane-body'), this.el.querySelector('.pane-term'));

    this.el.querySelector('.pane-head').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'sidebar') this.sb.setOpen(!this.sb.open);
      if (a === 'theme') pickTheme(this);
      if (a === 'right') splitPane(this, 'row');
      if (a === 'down') splitPane(this, 'col');
      if (a === 'reconnect') { this.connected = false; this.connect(); }
      if (a === 'close') closePane(this);
    });
    this.el.addEventListener('mousedown', () => setActive(this), true);

    const term = (this.term = new Terminal({
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
      fontSize: data.settings.fontSize || 14,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
      theme: getTheme(c?.theme),
    }));
    this.themeKey = c?.theme || DEFAULT_THEME;
    this.fit = new FitAddon.FitAddon();
    term.loadAddon(this.fit);
    term.loadAddon(new WebLinksAddon.WebLinksAddon((_e, url) => window.open(url)));
    term.open(this.el.querySelector('.xterm-host'));
    this.applyTheme(this.themeKey);
    term.textarea?.addEventListener('focus', () => setActive(this));

    term.onData((d) => {
      if (this.connected) {
        if (syncInput) {
          for (const p of panes.values()) if (p.connected) api.sshWrite(p.id, d);
        } else {
          api.sshWrite(this.id, d);
        }
        return;
      }
      if (!this.connecting && (d === '\r' || d === ' ')) this.connect();
    });
    term.onResize(({ cols, rows }) => this.connected && api.sshResize(this.id, cols, rows));

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && k === 'c' && term.hasSelection()) { this.copySelection(); return false; }
      if (e.ctrlKey && e.shiftKey && k === 'c') { this.copySelection(); return false; }
      if (e.ctrlKey && e.shiftKey && k === 'v') { this.paste(); return false; }
      if (e.ctrlKey && e.shiftKey && k === 'e') { splitPane(this, 'row'); return false; }
      if (e.ctrlKey && e.shiftKey && k === 'o') { splitPane(this, 'col'); return false; }
      if (e.ctrlKey && e.shiftKey && k === 'w') { closePane(this); return false; }
      if (e.altKey && e.key.startsWith('Arrow')) { focusNeighbor(this, e.key.slice(5).toLowerCase()); return false; }
      if (e.ctrlKey && !e.shiftKey && k === 'b') return false; // belge düzeyindeki Ctrl+B işleyicisi panele bakar
      return true;
    });

    this.el.querySelector('.pane-term').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      setActive(this);
      const sel = term.getSelection();
      contextMenu(e.clientX, e.clientY, [
        { label: t('common.copy'), icon: 'copy', kbd: 'Ctrl+C', disabled: !sel, action: () => this.copySelection() },
        { label: t('common.paste'), icon: 'download', kbd: 'Ctrl+Shift+V', disabled: !this.connected, action: () => this.paste() },
        { label: t('pane.saveSelShortcut'), icon: 'bolt', disabled: !sel.trim(), action: () => editShortcut({ command: sel.trim(), name: '', enter: true }) },
        '-',
        { label: t('pane.paletteMenu'), icon: 'palette', action: () => pickTheme(this) },
        '-',
        { label: t('pane.splitRight'), icon: 'columns', kbd: 'Ctrl+Shift+E', action: () => splitPane(this, 'row') },
        { label: t('pane.splitDown'), icon: 'rows', kbd: 'Ctrl+Shift+O', action: () => splitPane(this, 'col') },
        { label: t('pane.close'), icon: 'x', kbd: 'Ctrl+Shift+W', action: () => closePane(this) },
        '-',
        { label: t('pane.selectAll'), action: () => term.selectAll() },
        { label: t('pane.clear'), action: () => term.clear() },
      ]);
    });

    // Kabuk her prompt'ta OSC 7 ile bulunduğu klasörü bildirir
    term.parser.registerOscHandler(7, (payload) => {
      const m = /^file:\/\/[^/]*(\/.*)$/.exec(payload);
      if (!m) return true;
      let p = m[1];
      try { p = decodeURIComponent(p); } catch {}
      this.termCwd = p;
      api.sshLastDir(this.id, p);
      this.sb.onTermCwd(p);
      return true;
    });
  }

  get conn() { return data.connections.find((c) => c.id === this.connId); }

  // Konsol renk paletini uygula (terminal + çevresindeki alanın arka planı)
  applyTheme(key) {
    this.themeKey = key || DEFAULT_THEME;
    const th = getTheme(this.themeKey);
    this.term.options.theme = th;
    const area = this.el.querySelector('.pane-term');
    area.style.background = th.background;
    this.el.style.background = th.background;
  }

  setStatus(state, text) {
    this.el.querySelector('.status-dot').className = 'status-dot ' + state;
    if (text) this.el.querySelector('.pane-sub').textContent = text;
  }

  doFit() {
    try { this.fit.fit(); } catch {}
  }

  async copySelection() {
    const s = this.term.getSelection();
    if (s) { await api.clipboardWrite(s); this.term.clearSelection(); }
  }

  async paste() {
    const text = await api.clipboardRead();
    if (text && this.connected) this.term.paste(text);
    this.term.focus();
  }

  async connect() {
    if (this.connecting) return;
    this.connecting = true;
    this.setStatus('', t('pane.statusConnecting'));
    this.term.write(`\r\n\x1b[38;5;45m●\x1b[0m ${t('term.connecting')}\r\n`);
    this.doFit();
    const res = await api.sshStart({ pane: this.id, connId: this.connId, cols: this.term.cols, rows: this.term.rows });
    this.connecting = false;
    if (!panes.has(this.id)) { api.sshStop(this.id); return; } // bağlanırken kapatıldı
    if (!res.ok) {
      this.setStatus('off', t('pane.statusNoConn'));
      this.term.write(`\r\n\x1b[31m✖ ${t('term.connectFailed')}\x1b[0m ${res.message}\r\n\x1b[90m${t('term.retryEnter')}\x1b[0m\r\n`);
      this.sb.remote.showMessage(t('fm.noConn'));
      return;
    }
    this.connected = true;
    this.term.reset();
    this.el.querySelector('.pane-name').textContent = res.name;
    this.setStatus('on', `${res.username}@${res.host}`);
    try {
      this.home = await api.sftpRealpath(this.id, '.');
    } catch { this.home = '/'; }
    await this.sb.onConnected(res.startDir);
    if (this === active) this.term.focus();
  }

  onClosed() {
    this.connected = false;
    this.setStatus('off', t('pane.statusClosed'));
    this.term.write(`\r\n\r\n\x1b[33m■ ${t('term.closed')}\x1b[0m \x1b[90m${t('term.reconnectEnter')}\x1b[0m\r\n`);
    this.sb.remote.showMessage(t('fm.closed'));
  }

  dispose() {
    api.sshStop(this.id);
    this.term.dispose();
    this.el.remove();
  }
}

api.onSshData(({ pane, data: d }) => panes.get(pane)?.term.write(d));
api.onSshClosed(({ pane }) => panes.get(pane)?.onClosed());

// =============================================================================
// Bölme ağacı ve yerleşim
// =============================================================================
const panesEl = $('#panes');

function leaf(pane) { return { type: 'pane', pane }; }

// Bağlantı listesinden dengeli bir yerleşim üretir (2 → yan yana, 4 → 2×2 ...)
function buildTree(list, dir = 'row') {
  if (list.length === 1) return leaf(list[0]);
  const mid = Math.ceil(list.length / 2);
  const next = dir === 'row' ? 'col' : 'row';
  return { type: 'split', dir, ratio: mid / list.length, a: buildTree(list.slice(0, mid), next), b: buildTree(list.slice(mid), next) };
}

function renderTree() {
  const build = (node) => {
    if (node.type === 'pane') {
      node.pane.el.style.flex = '1 1 0';
      return node.pane.el;
    }
    const el = h(`<div class="split split-${node.dir}"></div>`);
    const a = build(node.a);
    const b = build(node.b);
    a.style.flex = `${node.ratio} 1 0`;
    b.style.flex = `${1 - node.ratio} 1 0`;
    const gutter = h('<div class="gutter"></div>');
    el.append(a, gutter, b);
    gutter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      gutter.classList.add('active');
      const rect = el.getBoundingClientRect();
      const move = (ev) => {
        const r = node.dir === 'row'
          ? (IS_RTL ? rect.right - ev.clientX : ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
        node.ratio = Math.max(0.1, Math.min(0.9, r));
        a.style.flex = `${node.ratio} 1 0`;
        b.style.flex = `${1 - node.ratio} 1 0`;
        fitAll();
      };
      const up = () => {
        gutter.classList.remove('active');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
      };
      document.body.style.cursor = node.dir === 'row' ? 'col-resize' : 'row-resize';
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    return el;
  };
  const top = root ? build(root) : null;
  panesEl.replaceChildren(...(top ? [top] : []));
  panesEl.classList.toggle('multi', panes.size > 1);
  updateTitle();
  fitAll();
}

let fitRaf = 0;
function fitAll() {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => panes.forEach((p) => p.doFit()));
}
new ResizeObserver(fitAll).observe(panesEl);

function updateTitle() {
  const list = [...panes.values()];
  if (list.length === 1) {
    const c = list[0].conn;
    $('#termTitle').textContent = c ? c.name : 'SSH Master';
    $('#termSub').textContent = '';
    document.title = `${c ? c.name : 'SSH'} — SSH Master`;
  } else {
    $('#termTitle').textContent = t('term.sessions', { n: list.length });
    $('#termSub').textContent = list.map((p) => p.conn?.name).filter(Boolean).join(' · ');
    document.title = `${t('term.sessions', { n: list.length })} — SSH Master`;
  }
  $('#btnSync').classList.toggle('hidden', list.length < 2);
  if (list.length < 2 && syncInput) setSync(false);
}

function setActive(pane) {
  if (active === pane || !pane) return;
  const prev = active;
  if (prev) prev.el.classList.remove('active');
  active = pane;
  pane.el.classList.add('active');
}

function addPane(connId) {
  const p = new Pane(connId);
  panes.set(p.id, p);
  return p;
}

// Ağaçta bir düğümü başka bir düğümle değiştir
function replaceNode(node, target, replacement) {
  if (node === target) return replacement;
  if (node.type === 'split') {
    node.a = replaceNode(node.a, target, replacement);
    node.b = replaceNode(node.b, target, replacement);
  }
  return node;
}
function findLeaf(node, pane) {
  if (node.type === 'pane') return node.pane === pane ? node : null;
  return findLeaf(node.a, pane) || findLeaf(node.b, pane);
}
function findParent(node, target, parent = null) {
  if (node === target) return parent;
  if (node.type !== 'split') return null;
  return findParent(node.a, target, node) || findParent(node.b, target, node);
}

async function splitPane(pane, dir) {
  if (panes.size >= MAX_PANES) { toast(t('term.maxPanes', { n: MAX_PANES }), { type: 'err' }); return; }
  const connId = await pickConnection(pane.connId, dir);
  if (!connId) { pane.term.focus(); return; }
  const p = addPane(connId);
  const l = findLeaf(root, pane);
  root = replaceNode(root, l, { type: 'split', dir, ratio: 0.5, a: l, b: leaf(p) });
  renderTree();
  setActive(p);
  // Bölünen iki bölmenin sol paneli yeni genişliğe uydurulur
  pane.sb.fitWidth();
  p.sb.fitWidth();
  const startLocal = pane.sb.local.cwd || data.settings.localDir;
  if (startLocal) p.sb.local.go(startLocal);
  // rAF değil setTimeout: pencere çizilmese (arka planda) de bağlantı başlasın
  setTimeout(() => { p.doFit(); p.connect(); }, 0);
}

function closePane(pane) {
  if (panes.size === 1) { window.close(); return; }
  const l = findLeaf(root, pane);
  const parent = findParent(root, l);
  const sibling = parent.a === l ? parent.b : parent.a;
  root = replaceNode(root, parent, sibling);
  panes.delete(pane.id);
  pane.dispose();
  if (active === pane) {
    active = null;
    const first = sibling.type === 'pane' ? sibling.pane : [...panes.values()][0];
    setActive(first);
  }
  renderTree();
  updateSidebarButton();
  focusActive();
}

// Alt+ok tuşları: komşu bölmeye geç
function focusNeighbor(pane, dir) {
  const r0 = pane.el.getBoundingClientRect();
  const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  let best = null;
  let bestD = Infinity;
  for (const p of panes.values()) {
    if (p === pane) continue;
    const r = p.el.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const dx = c.x - c0.x;
    const dy = c.y - c0.y;
    const ok = (dir === 'left' && dx < -5) || (dir === 'right' && dx > 5) || (dir === 'up' && dy < -5) || (dir === 'down' && dy > 5);
    if (!ok) continue;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) { setActive(best); best.term.focus(); }
}

// Yeni bölme için bağlantı seçici
function pickConnection(currentId, dir) {
  const conns = [...data.connections].sort((a, b) => a.name.localeCompare(b.name, LANG));
  const cur = conns.find((c) => c.id === currentId);
  const ordered = cur ? [cur, ...conns.filter((c) => c !== cur)] : conns;
  const body = h(`<div>
    <input class="input picker-search" placeholder="${esc(t('picker.search'))}" spellcheck="false" style="width:100%">
    <div class="picker-list"></div>
  </div>`);
  const list = body.querySelector('.picker-list');
  const search = body.querySelector('input');
  let items = [];
  let focusIdx = 0;
  let resolveFn;

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    items = ordered.filter((c) => !q || [c.name, c.host, c.username].some((v) => String(v).toLowerCase().includes(q)));
    focusIdx = Math.min(focusIdx, Math.max(0, items.length - 1));
    list.innerHTML = '';
    items.forEach((c, i) => {
      const it = h(`<div class="picker-item ${i === focusIdx ? 'focus' : ''}" style="--c:${esc(c.color || '#22d3ee')}">
        <span class="dot"></span><span class="nm">${esc(c.name)}</span>
        ${c === cur ? `<span class="tag" style="font-size:10.5px">${esc(t('picker.sameServer'))}</span>` : ''}
        <span class="sub">${esc(c.username)}@${esc(c.host)}</span></div>`);
      it.onclick = () => resolveFn(c.id);
      list.appendChild(it);
    });
    if (!items.length) list.appendChild(h(`<div class="empty-note">${esc(t('picker.none'))}</div>`));
  };
  search.addEventListener('input', () => { focusIdx = 0; draw(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { focusIdx = Math.min(items.length - 1, focusIdx + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { focusIdx = Math.max(0, focusIdx - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[focusIdx]) { e.preventDefault(); e.stopPropagation(); resolveFn(items[focusIdx].id); }
  });
  draw();

  return new Promise((resolve) => {
    openModal({
      title: dir === 'row' ? t('picker.titleRight') : t('picker.titleDown'),
      iconName: dir === 'row' ? 'columns' : 'rows',
      width: 520,
      body,
      buttons: [{ label: t('common.cancel'), value: null }],
      onMount: (_m, close) => { resolveFn = (v) => { close(v); }; },
    }).then((v) => resolve(v || null));
  });
}

// Konsol renk paleti seçici: seçim anında önizlenir, Kaydet bağlantıya yazar
async function pickTheme(pane) {
  const original = pane.themeKey;
  let chosen = original;
  const body = h(`<div><div style="color:var(--text-2);font-size:12.5px;margin-bottom:10px">${esc(t('palette.hint', { name: pane.conn?.name || '' }))}</div></div>`);
  body.appendChild(themeGrid(original, (k) => { chosen = k; pane.applyTheme(k); }));
  const ok = await openModal({
    title: t('palette.title'), iconName: 'palette', width: 640, body,
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), cls: 'primary', value: true }],
  });
  if (ok && chosen !== original) {
    await api.setConnectionTheme(pane.connId, chosen);
    toast(t('palette.saved'), { type: 'ok', sub: getTheme(chosen).name });
  } else if (!ok) {
    pane.applyTheme(original);
  }
  pane.term.focus();
}

// Senkron yazma: klavye girdisi tüm bağlı bölmelere gider
function setSync(on) {
  syncInput = on;
  $('#btnSync').classList.toggle('on', on);
  $('#btnSync').innerHTML = icon('link') + esc(on ? t('term.syncOn') : t('term.syncOff'));
  panes.forEach((p) => p.el.classList.toggle('sync', on));
}
$('#btnSync').onclick = () => { setSync(!syncInput); focusActive(); };
setSync(false);
$('#btnSplitRight').innerHTML = icon('columns') + esc(t('pane.splitRight'));
$('#btnSplitDown').innerHTML = icon('rows') + esc(t('pane.splitDown'));
$('#btnSync').title = t('term.syncTitle');
$('#btnSplitRight').title = t('term.splitRightTitle');
$('#btnSplitDown').title = t('term.splitDownTitle');
$('.term-bar').appendChild(mastertoolButton()); // en sağ üst köşe
$('#btnSplitRight').onclick = () => active && splitPane(active, 'row');
$('#btnSplitDown').onclick = () => active && splitPane(active, 'col');

// =============================================================================
// Ortak yardımcılar
// =============================================================================
const shq = (p) => `'${String(p).replace(/'/g, `'\\''`)}'`;
const joinRemote = (dir, name) => (dir.endsWith('/') ? dir : dir + '/') + name;
const cleanErr = (err) => String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const shortPath = (d) => { d = d || ''; return d.length > 34 ? '…' + d.slice(-33) : d; };

function dragHelper(handle, onMove, onEnd, onStart) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (onStart && onStart(e) === false) return;
    handle.classList.add('active');
    const move = (ev) => onMove(ev);
    const up = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      onEnd && onEnd();
    };
    document.body.style.cursor = getComputedStyle(handle).cursor;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

// Üst çubuk: tüm bölmelerin sol panellerini aç/kapat; Ctrl+B aktif bölmeninkini
$('#toggleSidebar').innerHTML = icon('sidebar');
$('#toggleSidebar').title = t('term.toggleAll');
$('#toggleSidebar').onclick = () => {
  const anyOpen = [...panes.values()].some((p) => p.sb.open);
  panes.forEach((p) => p.sb.setOpen(!anyOpen));
  updateSidebarButton();
};
function updateSidebarButton() {
  $('#toggleSidebar').classList.toggle('active', [...panes.values()].some((p) => p.sb.open));
}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b' && !document.querySelector('.modal-backdrop')) {
    e.preventDefault();
    if (active) active.sb.setOpen(!active.sb.open);
  }
});

// =============================================================================
// Kısayollar (komut listesi ortak; her bölmenin panelinde gösterilir)
// =============================================================================
function insertShortcut(s, pane = active) {
  const text = s.command.replace(/\r?\n/g, '\r') + (s.enter ? '\r' : '');
  const targets = syncInput ? [...panes.values()].filter((p) => p.connected) : pane && pane.connected ? [pane] : [];
  if (!targets.length) { toast(t('err.noConn'), { type: 'err' }); return; }
  for (const p of targets) api.sshWrite(p.id, text);
  pane && pane.term.focus();
}

async function editShortcut(s) {
  const isNew = !s || !s.id;
  const v = s || { name: '', command: '', enter: true };
  const res = await openModal({
    title: isNew ? t('sc.titleNew') : t('sc.titleEdit'), iconName: 'bolt',
    body: `
      <div class="field"><label>${esc(t('sc.name'))}</label><input class="input" id="sc-name" value="${esc(v.name)}" placeholder="${esc(t('sc.namePh'))}"></div>
      <div class="field"><label>${esc(t('sc.command'))}</label><textarea class="input" id="sc-cmd" rows="4" placeholder="sudo systemctl restart nginx" spellcheck="false">${esc(v.command)}</textarea></div>
      <label class="check"><input type="checkbox" id="sc-enter" ${v.enter ? 'checked' : ''}><span>${esc(t('sc.enter'))}<small>${esc(t('sc.enterHint'))}</small></span></label>`,
    buttons: [
      { label: t('common.cancel'), value: null },
      {
        label: t('common.save'), cls: 'primary',
        onClick: (m) => {
          const command = m.querySelector('#sc-cmd').value.replace(/\s+$/, '');
          if (!command.trim()) { m.querySelector('#sc-cmd').classList.add('invalid'); return false; }
          return { id: v.id, name: m.querySelector('#sc-name').value, command, enter: m.querySelector('#sc-enter').checked };
        },
      },
    ],
  });
  if (res) await api.saveShortcut(res);
  focusActive();
}

// =============================================================================
// Dosya listeleri (uzak + yerel ortak bileşen)
// =============================================================================
const collator = new Intl.Collator(LANG, { numeric: true, sensitivity: 'base' });

function createFileList({ listEl, pathInput, kind }) {
  const self = {
    kind, cwd: null, items: [], sel: new Set(), anchor: null,
    listEl, pathInput,
    loader: null,     // async (dir) => items
    parentOf: null,   // (dir) => parent | null
    stat: null,       // async (path) => { isDir }
    onOpenFile: null,
    onItemMenu: null,
    onBgMenu: null,
    onDropFrom: null, // (type, payload) => void
    onNavigated: null,
    acceptTypes: [],
  };

  self.showMessage = (msg, cls = 'empty-note') => { listEl.innerHTML = `<div class="${cls}">${esc(msg)}</div>`; };

  self.go = async (dir, { silent = false } = {}) => {
    if (!silent) listEl.innerHTML = `<div class="loading"><span class="spin"></span>${esc(t('fm.loading'))}</div>`;
    try {
      const items = await self.loader(dir);
      items.sort((a, b) => (b.isDir - a.isDir) || collator.compare(a.name, b.name));
      const changed = self.cwd !== dir;
      self.cwd = dir;
      self.items = items;
      if (changed) { self.sel.clear(); self.anchor = null; }
      pathInput.value = dir;
      self.render();
      self.onNavigated && self.onNavigated(dir);
      return true;
    } catch (err) {
      if (silent) return false;
      listEl.innerHTML = `<div class="err-note">${esc(t('fm.openFailed', { msg: cleanErr(err) }))}</div>`;
      pathInput.value = dir;
      return false;
    }
  };

  self.refresh = () => self.cwd && self.go(self.cwd, { silent: true });
  self.up = () => { const p = self.parentOf(self.cwd); if (p) self.go(p); };
  self.selected = () => self.items.filter((i) => self.sel.has(i.path));

  self.open = async (item) => {
    let isDir = item.isDir;
    if (item.isLink && self.stat) {
      try { isDir = (await self.stat(item.path)).isDir; } catch {}
    }
    if (isDir) self.go(item.path); else self.onOpenFile && self.onOpenFile(item);
  };

  self.render = () => {
    listEl.innerHTML = '';
    const parent = self.parentOf(self.cwd);
    if (parent) {
      const up = h(`<div class="item">${icon('up', 'ico-file')}<span class="nm">..</span></div>`);
      up.addEventListener('dblclick', () => self.up());
      listEl.appendChild(up);
    }
    if (!self.items.length) listEl.appendChild(h(`<div class="empty-note">${esc(t('fm.empty'))}</div>`));
    self.items.forEach((it, idx) => {
      const ic = it.isDir ? icon('folder', 'ico-dir') : it.isLink ? icon('link', 'ico-link') : icon('file', 'ico-file');
      const row = h(`<div class="item ${self.sel.has(it.path) ? 'sel' : ''} ${it.name.startsWith('.') ? 'hidden-file' : ''}" draggable="true" title="${esc(it.name)}${it.isDir ? '' : ' · ' + formatSize(it.size)}${it.mtime ? ' · ' + formatDate(it.mtime) : ''}">
        ${ic}<span class="nm">${esc(it.name)}</span><span class="meta">${it.isDir ? '' : formatSize(it.size)}</span></div>`);
      row.addEventListener('mousedown', (e) => {
        if (e.button === 2 && self.sel.has(it.path)) return; // sağ tık mevcut seçimi korur
        if (e.ctrlKey) {
          self.sel.has(it.path) ? self.sel.delete(it.path) : self.sel.add(it.path);
          self.anchor = idx;
        } else if (e.shiftKey && self.anchor != null) {
          self.sel.clear();
          const [a, b] = [Math.min(self.anchor, idx), Math.max(self.anchor, idx)];
          for (let k = a; k <= b; k++) self.sel.add(self.items[k].path);
        } else {
          if (e.button === 0 && self.sel.has(it.path) && self.sel.size > 1) return; // çoklu sürükleme için
          self.sel.clear();
          self.sel.add(it.path);
          self.anchor = idx;
        }
        updateSel();
      });
      row.addEventListener('click', (e) => {
        if (!e.ctrlKey && !e.shiftKey && self.sel.size > 1) { self.sel.clear(); self.sel.add(it.path); self.anchor = idx; updateSel(); }
      });
      row.addEventListener('dblclick', () => self.open(it));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        self.onItemMenu && self.onItemMenu(e, self.selected().length ? self.selected() : [it]);
      });
      row.addEventListener('dragstart', (e) => {
        if (!self.sel.has(it.path)) { self.sel.clear(); self.sel.add(it.path); updateSel(); }
        e.dataTransfer.setData(`application/x-sshm-${self.kind}`, JSON.stringify(self.selected()));
        e.dataTransfer.effectAllowed = 'copy';
      });
      row.dataset.path = it.path;
      listEl.appendChild(row);
    });
  };

  const updateSel = () => {
    listEl.querySelectorAll('.item[data-path]').forEach((r) => r.classList.toggle('sel', self.sel.has(r.dataset.path)));
  };

  listEl.addEventListener('mousedown', (e) => {
    if (e.target === listEl || e.target.classList.contains('empty-note')) { self.sel.clear(); updateSel(); }
  });
  listEl.addEventListener('contextmenu', (e) => { e.preventDefault(); self.onBgMenu && self.onBgMenu(e); });

  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') { e.preventDefault(); self.up(); }
    if (e.key === 'F5') { e.preventDefault(); self.refresh(); }
    if (e.key === 'Enter') { const s = self.selected(); if (s.length === 1) self.open(s[0]); }
    if (e.ctrlKey && e.key.toLowerCase() === 'a') { e.preventDefault(); self.items.forEach((i) => self.sel.add(i.path)); updateSel(); }
    if (e.key === 'Delete' && self.onDelete) { const s = self.selected(); if (s.length) self.onDelete(s); }
  });

  pathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); self.go(pathInput.value.trim()); listEl.focus(); }
    if (e.key === 'Escape') { pathInput.value = self.cwd || ''; listEl.focus(); }
  });

  // Diğer panelden veya Windows Gezgini'nden bırakma
  let depth = 0;
  const accepts = (dt) => self.acceptTypes.some((ty) => dt.types.includes(ty));
  listEl.addEventListener('dragenter', (e) => { if (accepts(e.dataTransfer)) { depth++; listEl.classList.add('drop-here'); } });
  listEl.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; listEl.classList.remove('drop-here'); } });
  listEl.addEventListener('dragover', (e) => { if (accepts(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  listEl.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    listEl.classList.remove('drop-here');
    for (const ty of self.acceptTypes) {
      if (ty === 'Files' && e.dataTransfer.files.length && !e.dataTransfer.types.some((x) => x.startsWith('application/x-sshm'))) {
        const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
        if (paths.length) return self.onDropFrom('Files', paths);
      } else if (e.dataTransfer.types.includes(ty)) {
        return self.onDropFrom(ty, JSON.parse(e.dataTransfer.getData(ty)));
      }
    }
  });

  return self;
}

const localParentOf = (d) => {
  if (!d) return null;
  const trimmed = d.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(trimmed)) return null;
  const i = trimmed.lastIndexOf('\\');
  if (i < 0) return null;
  const p = trimmed.slice(0, i);
  return /^[A-Za-z]:$/.test(p) ? p + '\\' : p;
};

// =============================================================================
// Bölme sol paneli: kısayollar + sunucu dosyaları + bilgisayarım
// =============================================================================
const SIDEBAR_HTML = () => `<aside class="sidebar">
  <section class="panel">
    <header class="panel-head">
      <button class="panel-toggle" data-collapse>${icon('chevronDown')}</button>
      <span class="panel-title">${esc(t('sb.shortcuts'))}</span>
      <span class="panel-actions"><button class="icon-btn" data-a="scAdd" title="${esc(t('sb.addShortcut'))}">${icon('plus')}</button></span>
    </header>
    <div class="panel-body list" data-el="shortcuts"></div>
  </section>
  <div class="hsplit"></div>
  <section class="panel">
    <header class="panel-head">
      <button class="panel-toggle" data-collapse>${icon('chevronDown')}</button>
      <span class="panel-title" data-el="remoteTitle">${esc(t('sb.server'))}</span>
      <span class="panel-actions">
        <button class="icon-btn active" data-a="rFollow" title="${esc(t('sb.follow'))}">${icon('crosshair')}</button>
        <button class="icon-btn" data-a="rNewDir" title="${esc(t('common.newFolder'))}">${icon('folderPlus')}</button>
        <button class="icon-btn" data-a="rHome" title="${esc(t('sb.home'))}">${icon('home')}</button>
        <button class="icon-btn" data-a="rUp" title="${esc(t('sb.up'))}">${icon('up')}</button>
        <button class="icon-btn" data-a="rRefresh" title="${esc(t('common.refresh'))}">${icon('refresh')}</button>
      </span>
    </header>
    <div class="path-bar"><input class="path-input" data-el="rPath" spellcheck="false"></div>
    <div class="panel-body list files" data-el="remoteList" tabindex="0"></div>
  </section>
  <div class="hsplit"></div>
  <section class="panel">
    <header class="panel-head">
      <button class="panel-toggle" data-collapse>${icon('chevronDown')}</button>
      <span class="panel-title">${esc(t('sb.computer'))}</span>
      <span class="panel-actions">
        <button class="icon-btn" data-a="lPlaces" title="${esc(t('sb.places'))}">${icon('drive')}</button>
        <button class="icon-btn" data-a="lNewDir" title="${esc(t('common.newFolder'))}">${icon('folderPlus')}</button>
        <button class="icon-btn" data-a="lUp" title="${esc(t('sb.up'))}">${icon('up')}</button>
        <button class="icon-btn" data-a="lRefresh" title="${esc(t('common.refresh'))}">${icon('refresh')}</button>
      </span>
    </header>
    <div class="path-bar"><input class="path-input" data-el="lPath" spellcheck="false"></div>
    <div class="panel-body list files" data-el="localList" tabindex="0"></div>
  </section>
</aside>`;

class Sidebar {
  constructor(pane) {
    this.pane = pane;
    this.follow = true;
    this.open = data.settings.sidebarOpen !== false;
    this.el = h(SIDEBAR_HTML());
    this.split = h(`<div class="vsplit" title="${esc(t('sb.resize'))}"></div>`);
    const q = (k) => this.el.querySelector(`[data-el="${k}"]`);
    this.panels = [...this.el.querySelectorAll('.panel')];

    // --- Kısayollar ---
    this.scEl = q('shortcuts');
    this.scEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [{ label: t('sc.new'), icon: 'plus', action: () => editShortcut(null) }]);
    });

    // --- Uzak dosyalar ---
    const remote = (this.remote = createFileList({ listEl: q('remoteList'), pathInput: q('rPath'), kind: 'remote' }));
    remote.acceptTypes = ['application/x-sshm-local', 'Files'];
    remote.loader = (dir) => (pane.connected ? api.sftpList(pane.id, dir) : Promise.reject(new Error(t('err.noConn'))));
    remote.stat = (p) => api.sftpStat(pane.id, p);
    remote.parentOf = (d) => (d && d !== '/' ? d.replace(/\/[^/]+\/?$/, '') || '/' : null);
    remote.onNavigated = (dir) => (pane.remoteCwd = dir);
    remote.onOpenFile = (item) => this.download([item]);
    remote.onDropFrom = (type, payload) => this.upload(type === 'Files' ? payload : payload.map((i) => i.path));
    remote.onDelete = (items) => this.deleteRemote(items);
    remote.onItemMenu = (e, items) => {
      const one = items.length === 1 ? items[0] : null;
      contextMenu(e.clientX, e.clientY, [
        { label: t('fm.downloadTo', { path: shortPath(this.local.cwd) }), icon: 'download', action: () => this.download(items) },
        '-',
        one && one.isDir ? { label: t('common.open'), icon: 'open', action: () => remote.go(one.path) } : null,
        one && one.isDir ? { label: t('fm.cdHere'), icon: 'terminal', action: () => this.cd(one.path) } : null,
        { label: t('common.copyPath'), icon: 'copy', action: () => api.clipboardWrite(items.map((i) => i.path).join('\n')) },
        { label: t('fm.pastePath'), icon: 'terminal', action: () => this.write(items.map((i) => shq(i.path)).join(' ') + ' ') },
        '-',
        one ? { label: t('common.rename'), icon: 'edit', action: () => this.renameRemote(one) } : null,
        { label: t('fm.deleteWhat', { what: one ? `“${one.name}”` : t('fm.nItems', { n: items.length }) }), icon: 'trash', danger: true, action: () => this.deleteRemote(items) },
      ]);
    };
    remote.onBgMenu = (e) => contextMenu(e.clientX, e.clientY, [
      { label: t('common.newFolder'), icon: 'folderPlus', action: () => this.newRemoteDir() },
      { label: t('common.refresh'), icon: 'refresh', kbd: 'F5', action: remote.refresh },
      { label: t('fm.cdHere'), icon: 'terminal', action: () => this.cd(remote.cwd) },
      { label: t('common.copyPath'), icon: 'copy', action: () => api.clipboardWrite(remote.cwd) },
    ]);
    remote.showMessage(t('fm.waiting'));

    // --- Yerel dosyalar ---
    const local = (this.local = createFileList({ listEl: q('localList'), pathInput: q('lPath'), kind: 'local' }));
    local.acceptTypes = ['application/x-sshm-remote'];
    local.loader = (dir) => api.localList(dir);
    local.parentOf = localParentOf;
    local.onNavigated = (dir) => api.setSettings({ localDir: dir });
    local.onOpenFile = (item) => api.localOpen(item.path);
    local.onDropFrom = (_t, items) => this.download(items);
    local.onItemMenu = (e, items) => {
      const one = items.length === 1 ? items[0] : null;
      contextMenu(e.clientX, e.clientY, [
        { label: t('fm.uploadTo', { path: shortPath(remote.cwd) || t('fm.server') }), icon: 'upload', disabled: !pane.connected || !remote.cwd, action: () => this.upload(items.map((i) => i.path)) },
        '-',
        one && one.isDir ? { label: t('common.open'), icon: 'open', action: () => local.go(one.path) } : null,
        one && !one.isDir ? { label: t('fm.openDefault'), icon: 'open', action: () => api.localOpen(one.path) } : null,
        one ? { label: t('fm.reveal'), icon: 'folder', action: () => api.localReveal(one.path) } : null,
        { label: t('common.copyPath'), icon: 'copy', action: () => api.clipboardWrite(items.map((i) => i.path).join('\n')) },
      ]);
    };
    local.onBgMenu = (e) => contextMenu(e.clientX, e.clientY, [
      { label: t('common.newFolder'), icon: 'folderPlus', action: () => this.newLocalDir() },
      { label: t('common.refresh'), icon: 'refresh', kbd: 'F5', action: local.refresh },
      { label: t('fm.openExplorer'), icon: 'folder', action: () => api.localOpen(local.cwd) },
    ]);

    // --- Düğmeler ---
    this.el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-a]');
      if (!btn) return;
      switch (btn.dataset.a) {
        case 'scAdd': return editShortcut(null);
        case 'rFollow':
          this.follow = !this.follow;
          btn.classList.toggle('active', this.follow);
          if (this.follow && pane.termCwd) remote.go(pane.termCwd);
          return toast(this.follow ? t('fm.following') : t('fm.followOff'), { timeout: 2000 });
        case 'rNewDir': return this.newRemoteDir();
        case 'rHome': return pane.home && remote.go(pane.home);
        case 'rUp': return remote.up();
        case 'rRefresh': return remote.refresh();
        case 'lNewDir': return this.newLocalDir();
        case 'lUp': return local.up();
        case 'lRefresh': return local.refresh();
        case 'lPlaces': {
          const r = btn.getBoundingClientRect();
          const [drives, sp] = await Promise.all([api.localDrives(), api.localSpecial()]);
          return contextMenu(r.left, r.bottom + 4, [
            { label: t('place.desktop'), icon: 'monitor', action: () => local.go(sp.desktop) },
            { label: t('place.downloads'), icon: 'download', action: () => local.go(sp.downloads) },
            { label: t('place.documents'), icon: 'file', action: () => local.go(sp.documents) },
            { label: t('place.home'), icon: 'home', action: () => local.go(sp.home) },
            '-',
            ...drives.map((d) => ({ label: t('place.drive', { d: d.slice(0, 2) }), icon: 'drive', action: () => local.go(d) })),
          ]);
        }
      }
    });

    // --- İç bölmeler: daralt/genişlet ve yükseklik ---
    const s = data.settings;
    (s.panelSizes || [1, 2, 2]).forEach((v, i) => this.panels[i] && (this.panels[i].style.flexGrow = v));
    (s.panelCollapsed || []).forEach((v, i) => this.panels[i] && this.panels[i].classList.toggle('collapsed', !!v));
    this.panels.forEach((p) => {
      const toggle = () => { p.classList.toggle('collapsed'); this.savePanels(); };
      p.querySelector('[data-collapse]').onclick = toggle;
      p.querySelector('.panel-title').addEventListener('dblclick', toggle);
    });
    this.el.querySelectorAll('.hsplit').forEach((split, i) => {
      let startY, a, b, ha, hb;
      dragHelper(split, (e) => {
        const na = Math.max(60, Math.min(ha + hb - 60, ha + e.clientY - startY));
        a.style.flexGrow = na;
        b.style.flexGrow = ha + hb - na;
      }, () => this.savePanels(), (e) => {
        a = this.panels[i]; b = this.panels[i + 1];
        if (a.classList.contains('collapsed') || b.classList.contains('collapsed')) return false;
        startY = e.clientY;
        this.panels.forEach((p) => { if (!p.classList.contains('collapsed')) p.style.flexGrow = p.offsetHeight; });
        ha = a.offsetHeight; hb = b.offsetHeight;
      });
    });

    // --- Genişlik (bölme içindeki dikey ayırıcı) ---
    let rect;
    dragHelper(this.split, (e) => {
      // Sağdan sola dillerde panel sağda durur; genişlik sağ kenardan ölçülür
      const w = IS_RTL ? rect.right - e.clientX : e.clientX - rect.left;
      this.el.style.width = Math.max(170, Math.min(rect.width - 160, w)) + 'px';
      pane.doFit();
    }, () => api.setSettings({ sidebarWidth: this.el.offsetWidth }), () => { rect = pane.el.getBoundingClientRect(); });

    this.renderShortcuts();
  }

  mount(body, termEl) {
    body.insertBefore(this.el, termEl);
    body.insertBefore(this.split, termEl);
    this.setOpen(this.open, { save: false });
  }

  // Varsayılan genişlik; çok bölmede bölme genişliğinin %40'ını geçmez
  fitWidth() {
    const w = data.settings.sidebarWidth || 300;
    const pw = this.pane.el.getBoundingClientRect().width;
    this.el.style.width = (panes.size > 1 && pw ? Math.max(170, Math.min(w, pw * 0.4)) : w) + 'px';
  }

  setOpen(open, { save = true } = {}) {
    this.open = open;
    this.pane.el.classList.toggle('no-sidebar', !open);
    this.pane.el.querySelector('[data-a="sidebar"]')?.classList.toggle('active', open);
    if (save) api.setSettings({ sidebarOpen: open });
    updateSidebarButton();
    fitAll();
  }

  savePanels() {
    api.setSettings({
      panelSizes: this.panels.map((p) => Number(p.style.flexGrow) || 1),
      panelCollapsed: this.panels.map((p) => p.classList.contains('collapsed')),
    });
  }

  renderShortcuts() {
    const el = this.scEl;
    el.innerHTML = '';
    if (!data.shortcuts.length) {
      el.appendChild(h(`<div class="empty-note">${t('sc.empty')}</div>`));
    }
    let dragId = null;
    for (const s of data.shortcuts) {
      const it = h(`<div class="item sc-item" draggable="true" title="${esc(t('sc.itemTitle'))}">
        <span class="sc-ico">${icon('bolt')}</span>
        <div class="sc-text"><div class="sc-name">${esc(s.name)}</div><div class="sc-cmd">${esc(s.command.split('\n')[0])}</div></div>
        ${s.enter ? `<span class="sc-enter" title="${esc(t('sc.autoEnter'))}">↵</span>` : ''}
      </div>`);
      it.addEventListener('dblclick', () => insertShortcut(s, this.pane));
      it.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        contextMenu(e.clientX, e.clientY, [
          { label: t('sc.paste'), icon: 'terminal', action: () => insertShortcut(s, this.pane) },
          { label: s.enter ? t('sc.pasteNoEnter') : t('sc.pasteRun'), icon: 'play', action: () => insertShortcut({ ...s, enter: !s.enter }, this.pane) },
          { label: t('sc.copy'), icon: 'copy', action: () => api.clipboardWrite(s.command) },
          '-',
          { label: t('common.edit'), icon: 'edit', action: () => editShortcut(s) },
          { label: t('common.delete'), icon: 'trash', danger: true, action: () => api.deleteShortcut(s.id) },
        ]);
      });
      it.addEventListener('dragstart', (e) => { dragId = s.id; e.dataTransfer.setData('application/x-sshm-sc', s.id); });
      it.addEventListener('dragend', () => (dragId = null));
      it.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); it.classList.add('drag-over'); } });
      it.addEventListener('dragleave', () => it.classList.remove('drag-over'));
      it.addEventListener('drop', (e) => {
        e.preventDefault();
        it.classList.remove('drag-over');
        if (!dragId || dragId === s.id) return;
        const ids = data.shortcuts.map((x) => x.id).filter((id) => id !== dragId);
        ids.splice(ids.indexOf(s.id), 0, dragId);
        api.reorderShortcuts(ids);
      });
      el.appendChild(it);
    }
  }

  // Bağlantı kurulunca dosya yöneticisini başlat
  async onConnected(startDir) {
    const c = this.pane.conn;
    this.el.querySelector('[data-el="remoteTitle"]').textContent = c ? t('sb.serverHost', { host: c.host }) : t('sb.server');
    const target = this.pane.remoteCwd || startDir || this.pane.home;
    if (!(await this.remote.go(target, { silent: true }))) await this.remote.go(this.pane.home || '/');
  }

  onTermCwd(p) {
    if (this.follow && this.remote.cwd && p !== this.remote.cwd) this.remote.go(p, { silent: true });
  }

  write(text) {
    if (!this.pane.connected) return;
    api.sshWrite(this.pane.id, text);
    this.pane.term.focus();
  }

  cd(p) { this.write(`cd -- ${shq(p)}\r`); }

  async newRemoteDir() {
    if (!this.remote.cwd) return;
    const name = await prompt(t('fm.newRemote'), { label: t('common.location', { path: this.remote.cwd }), okText: t('common.create'), iconName: 'folderPlus' });
    if (!name) return;
    try { await api.sftpMkdir(this.pane.id, joinRemote(this.remote.cwd, name)); this.remote.refresh(); } catch (err) { toast(t('err.mkdir'), { type: 'err', sub: cleanErr(err) }); }
  }

  async renameRemote(item) {
    const name = await prompt(t('common.rename'), { label: t('common.newName'), value: item.name, okText: t('common.save') });
    if (!name || name === item.name) return;
    try { await api.sftpRename(this.pane.id, item.path, joinRemote(this.remote.cwd, name)); this.remote.refresh(); } catch (err) { toast(t('err.rename'), { type: 'err', sub: cleanErr(err) }); }
  }

  async deleteRemote(items) {
    const names = items.map((i) => `<code>${esc(i.name)}</code>`).slice(0, 6).join(', ') + (items.length > 6 ? esc(t('fm.andMore', { n: items.length - 6 })) : '');
    const ok = await confirmBox(t('fm.deleteTitle'), t('fm.deleteMsg', { names }));
    if (!ok) return;
    for (const it of items) {
      try { await api.sftpDelete(this.pane.id, it.path, it.isDir); } catch (err) { toast(t('err.delete', { name: it.name }), { type: 'err', sub: cleanErr(err) }); }
    }
    this.remote.refresh();
  }

  async newLocalDir() {
    const name = await prompt(t('common.newFolder'), { label: t('common.location', { path: this.local.cwd }), okText: t('common.create'), iconName: 'folderPlus' });
    if (!name) return;
    try { await api.localMkdir(this.local.cwd.replace(/\\?$/, '\\') + name); this.local.refresh(); } catch (err) { toast(t('err.mkdir'), { type: 'err', sub: cleanErr(err) }); }
  }

  // Sunucudan bu bölmenin "Bilgisayarım" klasörüne indir
  download(items) {
    const localDir = this.local.cwd;
    if (!localDir || !this.pane.connected) return;
    for (const it of items) {
      Transfers.start(this.pane, 'download', it.name, (id) =>
        api.sftpDownload({ pane: this.pane.id, id, remotePath: it.path, isDir: it.isDir, localDir }), () =>
        panes.forEach((p) => p.sb.local.cwd === localDir && p.sb.local.refresh()));
    }
  }

  // Bilgisayardan bu bölmenin sunucu klasörüne yükle
  upload(paths) {
    const remoteDir = this.remote.cwd;
    if (!this.pane.connected || !remoteDir) { toast(t('err.connectFirst'), { type: 'err' }); return; }
    for (const p of paths) {
      Transfers.start(this.pane, 'upload', p.split('\\').pop(), (id) =>
        api.sftpUpload({ pane: this.pane.id, id, localPath: p, remoteDir }), () =>
        this.remote.cwd === remoteDir && this.remote.refresh());
    }
  }

  // --- Aktarımlar bölümü (arka plana alınan aktarımlar, panelin en altında) ---
  transferRow(tr) {
    if (!this.trPanel) {
      this.trPanel = h(`<section class="panel transfers-panel">
        <header class="panel-head">
          <button class="panel-toggle" data-collapse>${icon('chevronDown')}</button>
          <span class="panel-title">${esc(t('tr.panelTitle'))} <span class="badge" data-el="trCount"></span></span>
          <span class="panel-actions"><button class="icon-btn" data-a="trClear" title="${esc(t('tr.clearDone'))}">${icon('trash')}</button></span>
        </header>
        <div class="panel-body list" data-el="trList"></div>
      </section>`);
      this.trPanel.querySelector('[data-collapse]').onclick = () => this.trPanel.classList.toggle('collapsed');
      this.trPanel.querySelector('.panel-title').addEventListener('dblclick', () => this.trPanel.classList.toggle('collapsed'));
      this.trPanel.querySelector('[data-a="trClear"]').onclick = (e) => { e.stopPropagation(); Transfers.clearFinished(this.pane.id); };
      this.el.appendChild(this.trPanel);
    }
    const row = h(`<div class="tr-item">
      <div class="tr-top"><span class="tr-ico"></span><span class="tr-name"></span>
        <button class="icon-btn tr-cancel" title="${esc(t('common.cancel'))}">${icon('x')}</button></div>
      <div class="progress"><div></div></div>
      <div class="tr-stats"></div>
    </div>`);
    row.querySelector('.tr-cancel').onclick = () => (tr.finished ? Transfers.remove(tr.id) : Transfers.cancel(tr.id));
    tr.row = row; // sayaç bu satırı görsün diye güncellemeden önce atanır
    this.trPanel.querySelector('[data-el="trList"]').prepend(row);
    this.trPanel.classList.remove('collapsed');
    this.updateTransferCount();
    return row;
  }

  updateTransferCount() {
    if (!this.trPanel) return;
    const list = Transfers.forPane(this.pane.id).filter((x) => x.row);
    if (!list.length) { this.trPanel.remove(); this.trPanel = null; return; }
    const active = list.filter((x) => !x.finished).length;
    this.trPanel.querySelector('[data-el="trCount"]').textContent = active ? String(active) : '✓';
  }
}

// =============================================================================
// Aktarım yöneticisi: ilerleme penceresi + arka plan listesi
// =============================================================================
const BIG_BYTES = 5 * 1024 * 1024;
const BIG_FILES = 20;

function formatDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '…';
  sec = Math.round(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return t('time.hm', { h: Math.floor(m / 60), m: m % 60 });
  return m ? t('time.ms', { m, s }) : t('time.s', { s });
}

const Transfers = {
  list: new Map(), // id -> durum
  queue: Promise.resolve(),
  seq: 0,

  start(pane, kind, name, run, onDone) {
    const id = `tr${Date.now().toString(36)}${++this.seq}`;
    const tr = { id, paneId: pane.id, kind, name, phase: 'queued', total: 0, done: 0, files: 0, fileIndex: 0, current: '', speed: 0, finished: false, row: null, dialog: null };
    this.list.set(id, tr);
    // Aktarımlar sırayla çalışır; sıradaki aktarım arka plan listesinde "sırada" görünür
    if (data.settings.transfersInBackground && this.busy) this.toBackground(tr);
    this.busy = (this.busy || 0) + 1;
    this.queue = this.queue.then(async () => {
      if (tr.cancelRequested) { this.finish(tr, { phase: 'cancelled' }); return; }
      tr.startedAt = Date.now();
      tr.samples = [];
      const r = await run(id);
      onDone && onDone(r);
      if (!r.ok && !r.cancelled && tr.phase !== 'error') this.finish(tr, { phase: 'error', error: r.message });
    }).catch(() => {}).finally(() => (this.busy -= 1));
  },

  forPane(paneId) { return [...this.list.values()].filter((x) => x.paneId === paneId); },

  onProgress(p) {
    const tr = this.list.get(p.id);
    if (!tr) return;
    Object.assign(tr, { phase: p.phase, total: p.total, done: p.done, files: p.files, fileIndex: p.fileIndex, current: p.current });
    // Hız: son ~3 saniyelik örneklerden
    const now = Date.now();
    tr.samples.push([now, p.done]);
    while (tr.samples.length > 2 && now - tr.samples[0][0] > 3000) tr.samples.shift();
    const [t0, d0] = tr.samples[0];
    tr.speed = now > t0 ? ((p.done - d0) / (now - t0)) * 1000 : 0;

    if (['done', 'error', 'cancelled'].includes(p.phase)) return this.finish(tr, p);

    const big = tr.total > BIG_BYTES || tr.files > BIG_FILES;
    if (big && !tr.dialog && !tr.row && !tr.dismissed) {
      if (data.settings.transfersInBackground) this.toBackground(tr);
      else this.openDialog(tr);
    }
    this.render(tr);
  },

  statsText(tr) {
    if (tr.phase === 'queued') return t('tr.queued');
    if (tr.phase === 'scan') return t('tr.scanning');
    const parts = [];
    if (tr.files > 1) parts.push(t('tr.fileCount', { i: tr.fileIndex, n: tr.files }));
    parts.push(`${formatSize(tr.done)} / ${formatSize(tr.total)}`);
    if (!tr.finished && tr.speed > 0) {
      parts.push(`${formatSize(tr.speed)}/s`);
      parts.push(t('tr.eta', { time: formatDuration((tr.total - tr.done) / tr.speed) }));
    }
    return parts.join(' · ');
  },

  title(tr) { return t(tr.kind === 'download' ? 'tr.downloading' : 'tr.uploading', { name: tr.name }); },

  pct(tr) { return tr.total ? Math.min(100, (tr.done / tr.total) * 100) : tr.phase === 'done' ? 100 : 0; },

  render(tr) {
    const pct = this.pct(tr);
    if (tr.dialog) {
      const d = tr.dialog;
      d.querySelector('.progress > div').style.width = pct + '%';
      d.querySelector('[data-el="pct"]').textContent = `%${Math.floor(pct)}`;
      d.querySelector('[data-el="stats"]').textContent = this.statsText(tr);
      d.querySelector('[data-el="current"]').textContent = tr.files > 1 ? tr.current : '';
    }
    if (tr.row) {
      const r = tr.row;
      r.querySelector('.tr-ico').innerHTML = icon(tr.phase === 'done' ? 'check' : tr.phase === 'error' || tr.phase === 'cancelled' ? 'x' : tr.kind === 'download' ? 'download' : 'upload');
      r.querySelector('.tr-name').textContent = tr.name;
      r.querySelector('.tr-name').title = tr.current || tr.name;
      r.querySelector('.progress > div').style.width = pct + '%';
      r.querySelector('.tr-stats').textContent =
        tr.phase === 'done' ? `${t('tr.done')} · ${formatSize(tr.total)}` :
        tr.phase === 'cancelled' ? t('tr.cancelled') :
        tr.phase === 'error' ? tr.error || t('tr.failed') : this.statsText(tr);
      r.className = `tr-item ${tr.phase}`;
      r.querySelector('.tr-cancel').title = tr.finished ? t('tr.removeFromList') : t('common.cancel');
    }
  },

  openDialog(tr) {
    const back = h('<div class="modal-backdrop"></div>');
    const m = h(`<div class="modal transfer-dialog">
      <header><span style="color:var(--accent)">${icon(tr.kind === 'download' ? 'download' : 'upload')}</span><h2></h2></header>
      <div class="body">
        <div class="tr-dlg-row"><div class="progress big"><div></div></div><span class="tr-pct" data-el="pct">%0</span></div>
        <div class="tr-dlg-stats" data-el="stats"></div>
        <div class="tr-dlg-current" data-el="current"></div>
        <label class="check"><input type="checkbox" data-el="always"><span>${esc(t('tr.alwaysBackground'))}</span></label>
      </div>
      <footer><span class="spacer"></span>
        <button class="btn danger" data-a="cancel">${icon('x')}${esc(t('common.cancel'))}</button>
        <button class="btn primary" data-a="bg">${icon('download')}${esc(t('tr.showInBackground'))}</button>
      </footer>
    </div>`);
    m.querySelector('h2').textContent = this.title(tr);
    m.querySelector('[data-a="bg"]').innerHTML = `${icon('sidebar')}${esc(t('tr.showInBackground'))}`;
    m.querySelector('[data-a="cancel"]').onclick = () => this.cancel(tr.id);
    m.querySelector('[data-a="bg"]').onclick = () => {
      if (m.querySelector('[data-el="always"]').checked) {
        api.setSettings({ transfersInBackground: true });
        data.settings.transfersInBackground = true;
      }
      this.closeDialog(tr);
      this.toBackground(tr);
    };
    back.appendChild(m);
    document.body.appendChild(back);
    tr.dialog = m;
    tr.dialogBack = back;
    this.render(tr);
  },

  closeDialog(tr) {
    if (tr.dialogBack) tr.dialogBack.remove();
    tr.dialog = tr.dialogBack = null;
    tr.dismissed = true;
    focusActive();
  },

  toBackground(tr) {
    const pane = panes.get(tr.paneId);
    if (!pane || tr.row) return;
    if (!pane.sb.open) pane.sb.setOpen(true);
    tr.row = pane.sb.transferRow(tr);
    this.render(tr);
  },

  finish(tr, p) {
    tr.finished = true;
    tr.phase = p.phase;
    tr.error = p.error;
    if (tr.dialog) this.closeDialog(tr);
    if (tr.row) {
      this.render(tr);
      panes.get(tr.paneId)?.sb.updateTransferCount();
    }
    if (p.phase === 'done') toast(t(tr.kind === 'download' ? 'tr.downloadDone' : 'tr.uploadDone'), { type: 'ok', sub: tr.name });
    else if (p.phase === 'error') toast(t(tr.kind === 'download' ? 'tr.downloadFailed' : 'tr.uploadFailed', { name: tr.name }), { type: 'err', sub: p.error, timeout: 7000 });
    else if (p.phase === 'cancelled') toast(t('tr.cancelledToast'), { sub: tr.name });
    if (!tr.row) this.list.delete(tr.id);
  },

  cancel(id) {
    const tr = this.list.get(id);
    if (!tr || tr.finished) return;
    tr.cancelRequested = true;
    api.transferCancel(id);
  },

  remove(id) {
    const tr = this.list.get(id);
    if (!tr) return;
    tr.row?.remove();
    this.list.delete(id);
    panes.get(tr.paneId)?.sb.updateTransferCount();
  },

  clearFinished(paneId) {
    this.forPane(paneId).filter((x) => x.finished).forEach((x) => this.remove(x.id));
  },
};

api.onTransferProgress((p) => Transfers.onProgress(p));

// =============================================================================
// Başlat
// =============================================================================
function applyStore(d) {
  data = d;
  panes.forEach((p) => p.sb.renderShortcuts());
  const fs = d.settings.fontSize || 14;
  panes.forEach((p) => {
    if (p.term.options.fontSize !== fs) p.term.options.fontSize = fs;
    const key = p.conn?.theme || DEFAULT_THEME;
    if (key !== p.themeKey) p.applyTheme(key);
  });
  fitAll();
}
api.onStoreChanged(applyStore);

(async () => {
  const d = await api.getStore();
  data = d;
  const sp = await api.localSpecial();
  const startLocal = d.settings.localDir || sp.home;

  const ids = (new URLSearchParams(location.search).get('ids') || '').split(',').filter(Boolean);
  const list = ids.map((id) => addPane(id));
  if (!list.length) return;
  root = buildTree(list);
  renderTree();
  setActive(list[0]);
  list.forEach((p) => p.sb.fitWidth());
  for (const p of list) {
    if (!(await p.sb.local.go(startLocal, { silent: true }))) await p.sb.local.go(sp.home);
  }
  // rAF değil setTimeout: pencere çizilmese (arka planda) de bağlantılar başlasın
  setTimeout(() => {
    list.forEach((p) => { p.doFit(); p.connect(); });
    list[0].term.focus();
  }, 0);
})();
