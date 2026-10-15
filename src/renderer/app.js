'use strict';

// Ana pencere: bağlantı kartları, klasörler, bağlantı formu, ayarlar

const COLORS = ['#22d3ee', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#fbbf24', '#34d399', '#94a3b8'];

let data = { folders: [], connections: [], shortcuts: [], settings: {} };
let currentFolder = null;
let query = '';
const selected = new Set(); // seçili bağlantı kimlikleri (Ctrl+tık ile çoklu)

const $ = (s) => document.querySelector(s);

const selectedConns = () => data.connections.filter((c) => selected.has(c.id));

// Bir veya daha fazla bağlantıyı aç; birden fazlaysa tek pencerede bölünmüş açılır
function openConns(ids) {
  if (ids.length > 6) toast(t('app.maxPanes'), { type: 'err', sub: t('app.maxPanesSub') });
  window.api.openConnection(ids.slice(0, 6));
}

function updateSelectionUI() {
  document.querySelectorAll('.conn-card').forEach((x) => x.classList.toggle('selected', selected.has(x.dataset.id)));
  const n = selectedConns().length;
  const b = $('#btnSplit');
  b.classList.toggle('hidden', n < 2);
  b.innerHTML = icon('columns') + esc(t('app.split', { n }));
}

// --- Başlangıç ---------------------------------------------------------------
$('.search-ico').innerHTML = icon('search');
$('#btnSettings').innerHTML = icon('gear');
$('#btnNewFolder').innerHTML = icon('folderPlus') + esc(t('common.newFolder'));
$('#btnNewConn').innerHTML = icon('plus') + esc(t('app.newConn'));
$('#search').placeholder = t('app.searchPh');
$('#btnSplit').title = t('app.splitTitle');
$('#btnSettings').title = t('app.settings');

$('#btnSplit').onclick = () => openConns(selectedConns().map((c) => c.id));
$('#btnSettings').onclick = openSettings;
$('#content').addEventListener('mousedown', (e) => {
  if (!e.target.closest('.card, .new-card') && !e.ctrlKey) { selected.clear(); updateSelectionUI(); }
});
$('#btnNewFolder').onclick = newFolder;
$('#btnNewConn').onclick = () => editConnection(null);
$('#search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });

document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-backdrop')) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); editConnection(null); }
  if (e.key === 'Escape' && document.activeElement === $('#search')) { $('#search').value = ''; query = ''; render(); $('#search').blur(); }
  if (e.key === 'Backspace' && document.activeElement.tagName !== 'INPUT' && currentFolder) { goFolder(folderById(currentFolder)?.parentId || null); }
  const sel = selectedConns();
  if (sel.length && document.activeElement.tagName !== 'INPUT') {
    if (e.key === 'Enter') openConns(sel.map((c) => c.id));
    if (e.key === 'Delete' && sel.length === 1) deleteConnection(sel[0]);
    if (e.key === 'F2' && sel.length === 1) editConnection(sel[0]);
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'a' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.querySelectorAll('.conn-card').forEach((x) => selected.add(x.dataset.id));
    updateSelectionUI();
  }
});

window.api.onStoreChanged((d) => { data = d; render(); });
window.api.getStore().then((d) => { data = d; render(); });

// --- Yardımcılar -------------------------------------------------------------
const folderById = (id) => data.folders.find((f) => f.id === id);
const sortByName = (a, b) => a.name.localeCompare(b.name, LANG, { sensitivity: 'base' });

function folderPath(id) {
  const out = [];
  let f = folderById(id);
  while (f) { out.unshift(f); f = folderById(f.parentId); }
  return out;
}

function countIn(folderId) {
  // Alt klasörler dahil bağlantı sayısı
  let n = data.connections.filter((c) => (c.folderId || null) === folderId).length;
  for (const sub of data.folders.filter((f) => (f.parentId || null) === folderId)) n += countIn(sub.id);
  return n;
}

function goFolder(id) {
  currentFolder = id && folderById(id) ? id : null;
  selected.clear();
  render();
}

// --- Çizim -------------------------------------------------------------------
function render() {
  if (currentFolder && !folderById(currentFolder)) currentFolder = null;
  for (const id of [...selected]) if (!data.connections.some((c) => c.id === id)) selected.delete(id);
  renderCrumbs();
  renderGrid();
  updateSelectionUI();
  const nc = data.connections.length;
  const nf = data.folders.length;
  $('#stats').textContent = nc ? t('app.stats', { c: nc, f: nf }) : t('app.welcome');
}

function renderCrumbs() {
  const el = $('#crumbs');
  el.innerHTML = '';
  if (query) {
    el.appendChild(h(`<span class="crumb current">${icon('search')} ${esc(t('app.results', { q: query }))}</span>`));
    return;
  }
  const parts = [{ id: null, name: t('app.all') }, ...folderPath(currentFolder)];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const c = h(`<span class="crumb ${last ? 'current' : ''}">${i === 0 ? icon('home') : icon('folder')}${esc(p.name)}</span>`);
    if (!last) {
      c.onclick = () => goFolder(p.id);
      makeDropTarget(c, p.id);
    }
    el.appendChild(c);
    if (!last) el.appendChild(h(`<span class="crumb-sep">${icon('chevronRight')}</span>`));
  });
}

function renderGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';

  if (!data.connections.length && !data.folders.length) {
    const w = h(`<div class="welcome"><div class="new-card">
      <div class="plus">${icon('plus')}</div>
      <div class="lbl">${esc(t('common.new'))}</div>
      <div class="hint">${t('app.welcomeHint')}</div>
    </div></div>`);
    w.querySelector('.new-card').onclick = () => editConnection(null);
    grid.appendChild(w);
    return;
  }

  let folders;
  let conns;
  if (query) {
    folders = data.folders.filter((f) => f.name.toLowerCase().includes(query));
    conns = data.connections.filter((c) =>
      [c.name, c.host, c.username, String(c.port)].some((v) => String(v || '').toLowerCase().includes(query))
    );
  } else {
    folders = data.folders.filter((f) => (f.parentId || null) === currentFolder);
    conns = data.connections.filter((c) => (c.folderId || null) === currentFolder);
  }
  folders.sort(sortByName);
  conns.sort(sortByName);

  if (folders.length) {
    grid.appendChild(h(`<div class="section-title">${esc(t('app.folders'))}</div>`));
    for (const f of folders) grid.appendChild(folderCard(f));
  }
  grid.appendChild(h(`<div class="section-title">${esc(t('app.connections'))}${conns.length > 1 ? `<span class="hint">${esc(t('app.multiHint'))}</span>` : ''}</div>`));
  for (const c of conns) grid.appendChild(connCard(c));

  if (!query) {
    const n = h(`<div class="new-card"><div class="plus">${icon('plus')}</div><div class="lbl">${esc(t('common.new'))}</div></div>`);
    n.onclick = () => editConnection(null);
    grid.appendChild(n);
  } else if (!conns.length && !folders.length) {
    grid.appendChild(h(`<div class="empty-note" style="grid-column:1/-1">${esc(t('app.noMatch'))}</div>`));
  }
}

function folderCard(f) {
  const n = countIn(f.id);
  const el = h(`<div class="card folder-card" draggable="true">
    <div class="avatar">${icon('folder')}</div>
    <div style="min-width:0">
      <div class="card-title">${esc(f.name)}</div>
      <div class="card-sub">${esc(t('app.folderCount', { n }))}</div>
    </div></div>`);
  el.addEventListener('dblclick', () => { $('#search').value = ''; query = ''; goFolder(f.id); });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      { label: t('common.open'), icon: 'open', action: () => goFolder(f.id) },
      {
        label: t('app.folderOpenSplit'), icon: 'columns',
        disabled: data.connections.filter((c) => c.folderId === f.id).length < 1,
        action: () => openConns(data.connections.filter((c) => c.folderId === f.id).sort(sortByName).map((c) => c.id)),
      },
      { label: t('app.newConnHere'), icon: 'plus', action: () => editConnection(null, f.id) },
      { label: t('app.newSubfolder'), icon: 'folderPlus', action: () => newFolder(f.id) },
      '-',
      { label: t('common.rename'), icon: 'edit', kbd: 'F2', action: () => renameFolder(f) },
      { label: t('common.moveEllipsis'), icon: 'move', action: () => moveDialog({ type: 'folder', item: f }) },
      '-',
      { label: t('common.delete'), icon: 'trash', danger: true, action: () => deleteFolder(f) },
    ]);
  });
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-sshm', JSON.stringify({ type: 'folder', id: f.id }));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  makeDropTarget(el, f.id);
  return el;
}

function connCard(c) {
  const where = query && c.folderId ? folderPath(c.folderId).map((f) => f.name).join(' / ') : '';
  const el = h(`<div class="card conn-card ${selected.has(c.id) ? 'selected' : ''}" data-id="${esc(c.id)}" draggable="true" style="--c:${esc(c.color || '#22d3ee')}">
    <div class="card-head">
      <div class="avatar">${icon('server')}</div>
      <div style="min-width:0;flex:1">
        <div class="card-title">${esc(c.name)}</div>
        <div class="card-sub">${esc(c.username)}@${esc(c.host)}${Number(c.port) !== 22 ? ':' + esc(c.port) : ''}</div>
      </div>
    </div>
    <div class="quick">
      <button class="icon-btn" data-a="edit" title="${esc(t('common.edit'))}">${icon('edit')}</button>
      <button class="icon-btn connect" data-a="open" title="${esc(t('common.connect'))}">${icon('play')}</button>
    </div>
    <div class="card-foot">
      ${c.theme && c.theme !== DEFAULT_THEME ? `<span class="tag" title="${esc(t('form.palette'))}"><span class="theme-dot" style="background:${getTheme(c.theme).background};border-color:${getTheme(c.theme).green}"></span>${esc(getTheme(c.theme).name)}</span>` : ''}
      ${c.authType === 'key' ? `<span class="tag">${icon('key')}${esc(t('app.keyTag'))}</span>` : ''}
      ${c.rememberLastDir ? `<span class="tag dir" title="${esc(t('app.lastDir'))}">${icon('history')}${esc(c.lastDir || t('app.lastDirTag'))}</span>` : ''}
      ${where ? `<span class="tag">${icon('folder')}${esc(where)}</span>` : ''}
    </div></div>`);
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'open') return openConns([c.id]);
    if (a === 'edit') return editConnection(c);
    if (e.ctrlKey) {
      selected.has(c.id) ? selected.delete(c.id) : selected.add(c.id);
    } else {
      selected.clear();
      selected.add(c.id);
    }
    updateSelectionUI();
  });
  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-a]') || e.ctrlKey) return;
    openConns([c.id]);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!selected.has(c.id)) { selected.clear(); selected.add(c.id); updateSelectionUI(); }
    const multi = selectedConns();
    if (multi.length > 1) {
      contextMenu(e.clientX, e.clientY, [
        { label: t('app.multiOpenSplit', { n: multi.length }), icon: 'columns', kbd: 'Enter', action: () => openConns(multi.map((x) => x.id)) },
        { label: t('app.openSeparate'), icon: 'terminal', action: () => multi.forEach((x) => openConns([x.id])) },
        '-',
        { label: t('app.clearSelection'), icon: 'x', action: () => { selected.clear(); updateSelectionUI(); } },
      ]);
      return;
    }
    contextMenu(e.clientX, e.clientY, [
      { label: t('common.connect'), icon: 'terminal', kbd: 'Enter', action: () => openConns([c.id]) },
      { label: t('app.sideBySide'), icon: 'columns', action: () => openConns([c.id, c.id]) },
      '-',
      { label: t('common.edit'), icon: 'edit', kbd: 'F2', action: () => editConnection(c) },
      { label: t('app.duplicate'), icon: 'copy', action: () => window.api.duplicateConnection(c.id) },
      { label: t('app.moveToFolder'), icon: 'move', action: () => moveDialog({ type: 'conn', item: c }) },
      c.rememberLastDir && c.lastDir ? { label: t('app.resetLastDir'), icon: 'history', action: () => window.api.resetLastDir(c.id) } : null,
      '-',
      { label: t('common.delete'), icon: 'trash', danger: true, kbd: 'Del', action: () => deleteConnection(c) },
    ]);
  });
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-sshm', JSON.stringify({ type: 'conn', id: c.id }));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

// Sürükle-bırak: bağlantı/klasörü bir klasöre (veya üst seviyeye) taşı
function makeDropTarget(el, folderId) {
  let depth = 0;
  el.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('application/x-sshm')) return;
    depth++;
    el.classList.add('drop');
  });
  el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('drop'); } });
  el.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-sshm')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    el.classList.remove('drop');
    const d = JSON.parse(e.dataTransfer.getData('application/x-sshm') || '{}');
    if (d.type === 'conn') {
      await window.api.moveConnection(d.id, folderId);
      toast(t('app.connMoved'), { type: 'ok', sub: folderId ? folderById(folderId).name : t('app.all') });
    } else if (d.type === 'folder' && d.id !== folderId) {
      const ok = await window.api.moveFolder(d.id, folderId);
      if (!ok) toast(t('app.folderIntoSelf'), { type: 'err' });
    }
  });
}

// --- Klasör işlemleri ----------------------------------------------------------
async function newFolder(parentId = currentFolder) {
  const name = await prompt(t('common.newFolder'), { label: t('common.folderName'), placeholder: t('app.folderPh'), okText: t('common.create'), iconName: 'folderPlus' });
  if (name) await window.api.saveFolder({ name, parentId: typeof parentId === 'string' ? parentId : currentFolder });
}

async function renameFolder(f) {
  const name = await prompt(t('app.renameFolder'), { label: t('common.folderName'), value: f.name, okText: t('common.save') });
  if (name) await window.api.saveFolder({ id: f.id, name });
}

async function deleteFolder(f) {
  const n = countIn(f.id);
  const ok = await confirmBox(t('app.deleteFolder'), t('app.deleteFolderMsg', { name: esc(f.name) }) + (n ? t('app.deleteFolderConns', { n }) : ''));
  if (ok) await window.api.deleteFolder(f.id);
}

function folderOptions(selected, excludeId) {
  // Hiyerarşik klasör listesi (select için)
  const out = [`<option value="">${esc(t('app.rootFolder'))}</option>`];
  const walk = (parentId, depth) => {
    for (const f of data.folders.filter((x) => (x.parentId || null) === parentId).sort(sortByName)) {
      if (f.id === excludeId) continue;
      out.push(`<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${'&nbsp;&nbsp;&nbsp;'.repeat(depth)}${esc(f.name)}</option>`);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return out.join('');
}

async function moveDialog({ type, item }) {
  const current = type === 'conn' ? item.folderId : item.parentId;
  const target = await openModal({
    title: t('app.moveTitle', { name: item.name }), iconName: 'move',
    body: `<div class="field"><label>${esc(t('app.targetFolder'))}</label><select class="input" id="mv">${folderOptions(current, type === 'folder' ? item.id : null)}</select></div>`,
    buttons: [
      { label: t('common.cancel'), value: null },
      { label: t('common.move'), cls: 'primary', onClick: (m) => ({ v: m.querySelector('#mv').value || null }) },
    ],
  });
  if (!target) return;
  if (type === 'conn') await window.api.moveConnection(item.id, target.v);
  else if (!(await window.api.moveFolder(item.id, target.v))) toast(t('app.folderIntoSelf'), { type: 'err' });
}

async function deleteConnection(c) {
  const ok = await confirmBox(t('app.deleteConn'), t('app.deleteConnMsg', { name: esc(c.name), target: esc(`${c.username}@${c.host}`) }));
  if (ok) { await window.api.deleteConnection(c.id); selected.delete(c.id); }
}

// --- Bağlantı formu ------------------------------------------------------------
async function editConnection(conn, folderId) {
  const isNew = !conn;
  const c = conn || {
    name: '', host: '', port: 22, username: 'root', authType: 'password', keyPath: '',
    folderId: folderId ?? currentFolder, rememberLastDir: true, color: COLORS[data.connections.length % COLORS.length],
  };
  let color = c.color || COLORS[0];
  let theme = c.theme || DEFAULT_THEME;
  let authType = c.authType || 'password';
  let testedHostKey = null;

  const body = h(`<div style="display:grid;gap:14px">
    <div class="field"><label>${esc(t('form.name'))}</label><input class="input" id="f-name" placeholder="${esc(t('form.namePh'))}" value="${esc(c.name)}"></div>
    <div class="row c-3-1">
      <div class="field"><label>${esc(t('form.host'))}</label><input class="input" id="f-host" placeholder="${esc(t('form.hostPh'))}" value="${esc(c.host)}" spellcheck="false"></div>
      <div class="field"><label>${esc(t('form.port'))}</label><input class="input" id="f-port" type="number" min="1" max="65535" value="${esc(c.port || 22)}"></div>
    </div>
    <div class="field"><label>${esc(t('form.user'))}</label><input class="input" id="f-user" value="${esc(c.username)}" spellcheck="false"></div>
    <div class="field">
      <label>${esc(t('form.auth'))}</label>
      <div class="seg" id="f-auth"><button data-v="password">${esc(t('form.password'))}</button><button data-v="key">${esc(t('form.privateKey'))}</button></div>
    </div>
    <div class="field" id="pw-field"><label>${esc(t('form.password'))}</label>
      <div class="pw-wrap"><input class="input" id="f-pass" type="password" placeholder="${c.hasPassword ? esc(t('form.pwSaved')) : ''}" autocomplete="new-password">
      <button class="icon-btn" id="f-eye" type="button" title="${esc(t('common.show'))}">${icon('eye')}</button></div>
    </div>
    <div id="key-fields" class="hidden" style="display:grid;gap:14px">
      <div class="field"><label>${esc(t('form.keyFile'))}</label>
        <div class="key-wrap"><input class="input" id="f-key" value="${esc(c.keyPath)}" placeholder="C:\\Users\\…\\.ssh\\id_ed25519" spellcheck="false"><button class="btn" id="f-keypick" type="button">${esc(t('common.choose'))}</button></div>
      </div>
      <div class="field"><label>${esc(t('form.passphrase'))}</label><input class="input" id="f-phrase" type="password" placeholder="${esc(c.hasPassphrase ? t('form.passSaved') : t('form.passEmpty'))}"></div>
    </div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('form.folder'))}</label><select class="input" id="f-folder">${folderOptions(c.folderId)}</select></div>
      <div class="field"><label>${esc(t('form.color'))}</label><div class="colors" id="f-colors" style="height:36px;align-items:center"></div></div>
    </div>
    <div class="field"><label>${esc(t('form.palette'))}</label><div id="f-theme"></div></div>
    <label class="check"><input type="checkbox" id="f-last" ${c.rememberLastDir ? 'checked' : ''}>
      <span>${esc(t('form.lastDir'))}<small>${esc(t('form.lastDirHint'))}${c.lastDir ? ` ${esc(t('form.lastDirNow'))} <code>${esc(c.lastDir)}</code>` : ''}</small></span></label>
    <div class="test-result" id="f-result"></div>
  </div>`);

  const q = (s) => body.querySelector(s);
  const setAuth = (v) => {
    authType = v;
    body.querySelectorAll('#f-auth button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    q('#key-fields').classList.toggle('hidden', v !== 'key');
    q('#pw-field').classList.toggle('hidden', v === 'key');
  };
  body.querySelectorAll('#f-auth button').forEach((b) => (b.onclick = () => setAuth(b.dataset.v)));
  setAuth(authType);

  q('#f-eye').onclick = () => {
    const p = q('#f-pass');
    p.type = p.type === 'password' ? 'text' : 'password';
    q('#f-eye').innerHTML = icon(p.type === 'password' ? 'eye' : 'eyeOff');
  };
  q('#f-keypick').onclick = async () => { const p = await window.api.pickKeyFile(); if (p) q('#f-key').value = p; };

  const colorsEl = q('#f-colors');
  for (const col of COLORS) {
    const b = h(`<button type="button" style="--c:${col}" class="${col === color ? 'on' : ''}"></button>`);
    b.onclick = () => { color = col; colorsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    colorsEl.appendChild(b);
  }

  q('#f-theme').appendChild(themeGrid(theme, (k) => (theme = k)));

  const readForm = () => ({
    theme,
    id: c.id,
    name: q('#f-name').value.trim() || q('#f-host').value.trim(),
    host: q('#f-host').value.trim(),
    port: Number(q('#f-port').value) || 22,
    username: q('#f-user').value.trim(),
    authType,
    password: authType === 'password' ? q('#f-pass').value : '',
    keyPath: authType === 'key' ? q('#f-key').value.trim() : '',
    passphrase: authType === 'key' ? q('#f-phrase').value : '',
    folderId: q('#f-folder').value || null,
    rememberLastDir: q('#f-last').checked,
    color,
    testedHostKey,
  });

  const validate = () => {
    let ok = true;
    for (const id of ['#f-host', '#f-user']) {
      const el = q(id);
      const bad = !el.value.trim();
      el.classList.toggle('invalid', bad);
      if (bad) ok = false;
    }
    if (authType === 'key' && !q('#f-key').value.trim()) { q('#f-key').classList.add('invalid'); ok = false; }
    return ok;
  };

  const showResult = (cls, html) => {
    const r = q('#f-result');
    r.className = `test-result show ${cls}`;
    r.innerHTML = html;
  };

  const runTest = async (btn) => {
    if (!validate()) return false;
    btn.disabled = true;
    showResult('', `<span class="spin" style="color:var(--accent);margin-top:2px"></span><div>${esc(t('form.connecting'))}</div>`);
    const res = await window.api.testConnection(readForm());
    btn.disabled = false;
    if (res.ok) {
      testedHostKey = res.fingerprint;
      showResult('ok', `${icon('check')}<div><b>${esc(t('form.testOk'))}</b> · ${res.ms} ms${res.info ? `<br>${esc(res.info)}` : ''}
        <div class="fp">${esc(t('form.hostKey', { fp: res.fingerprint }))}</div></div>`);
    } else {
      showResult('err', `${icon('x')}<div><b>${esc(t('form.testFail'))}</b><br>${esc(res.message)}</div>`);
    }
    return false;
  };

  const save = async (andConnect) => {
    if (!validate()) return false;
    const id = await window.api.saveConnection(readForm());
    toast(isNew ? t('form.saved') : t('form.changesSaved'), { type: 'ok', sub: q('#f-name').value || q('#f-host').value });
    if (andConnect) window.api.openConnection(id);
    return true;
  };

  await openModal({
    title: isNew ? t('form.titleNew') : t('form.titleEdit'),
    iconName: 'server',
    width: 580,
    body,
    buttons: [
      { label: t('form.test'), icon: 'bolt', left: true, onClick: (_m, btn) => runTest(btn) },
      { label: t('common.cancel'), cls: 'ghost', value: null },
      { label: t('form.saveConnect'), onClick: () => save(true) },
      { label: t('common.save'), cls: 'primary', onClick: () => save(false) },
    ],
  });
}

// --- Ayarlar -----------------------------------------------------------------
async function openSettings() {
  const s = data.settings || {};
  let appTheme = s.appTheme || 'dark';
  const langOptions = Object.entries(I18N.LANGUAGES)
    .map(([code, l]) => `<option value="${code}" ${code === LANG ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const body = h(`<div style="display:grid;gap:16px">
    <div class="section-title" style="margin:0">${esc(t('set.appearance'))}</div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('set.theme'))}</label>
        <div class="seg" id="s-theme">
          <button data-v="dark">${icon('moon')}${esc(t('set.themeDark'))}</button>
          <button data-v="light">${icon('sun')}${esc(t('set.themeLight'))}</button>
          <button data-v="system">${icon('monitor')}${esc(t('set.themeSystem'))}</button>
        </div></div>
      <div class="field"><label>${esc(t('set.language'))}</label><select class="input" id="s-lang">${langOptions}</select></div>
    </div>
    <div class="section-title" style="margin:6px 0 0">${esc(t('set.window'))}</div>
    <label class="check"><input type="checkbox" id="s-min" ${s.minimizeToTray ? 'checked' : ''}>
      <span>${esc(t('set.minTray'))}<small>${esc(t('set.minTrayHint'))}</small></span></label>
    <label class="check"><input type="checkbox" id="s-close" ${s.closeToTray ? 'checked' : ''}>
      <span>${esc(t('set.closeTray'))}<small>${esc(t('set.closeTrayHint'))}</small></span></label>
    <div class="section-title" style="margin:6px 0 0">${esc(t('set.transfers'))}</div>
    <label class="check"><input type="checkbox" id="s-trbg" ${s.transfersInBackground ? 'checked' : ''}>
      <span>${esc(t('set.trBg'))}<small>${esc(t('set.trBgHint'))}</small></span></label>
    <div class="section-title" style="margin:6px 0 0">${esc(t('set.terminal'))}</div>
    <div class="field" style="max-width:200px"><label>${esc(t('set.fontSize'))}</label>
      <input class="input" id="s-font" type="number" min="9" max="28" value="${esc(s.fontSize || 14)}"></div>
  </div>`);

  // Tema seçimi anında uygulanır (önizleme); İptal edilirse eski temaya döner
  const setTheme = (v) => {
    appTheme = v;
    body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    window.api.setSettings({ appTheme: v });
  };
  body.querySelectorAll('#s-theme button').forEach((b) => (b.onclick = () => setTheme(b.dataset.v)));
  body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === appTheme));
  const originalTheme = appTheme;

  const res = await openModal({
    title: t('set.title'), iconName: 'gear', width: 600, body,
    buttons: [
      { label: t('common.cancel'), value: null },
      {
        label: t('common.save'), cls: 'primary',
        onClick: (m) => ({
          appTheme,
          language: m.querySelector('#s-lang').value,
          minimizeToTray: m.querySelector('#s-min').checked,
          closeToTray: m.querySelector('#s-close').checked,
          transfersInBackground: m.querySelector('#s-trbg').checked,
          fontSize: Math.min(28, Math.max(9, Number(m.querySelector('#s-font').value) || 14)),
        }),
      },
    ],
  });
  if (!res) {
    if (appTheme !== originalTheme) window.api.setSettings({ appTheme: originalTheme });
    return;
  }
  const langChanged = res.language !== LANG;
  if (!langChanged) delete res.language; // dil değişmediyse pencereyi yeniden yükleme
  await window.api.setSettings(res);
  data.settings = { ...data.settings, ...res };
  if (!langChanged) toast(t('set.saved'), { type: 'ok' });
}
