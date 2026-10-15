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
  if (ids.length > 6) toast('En fazla 6 bölme açılabilir', { type: 'err', sub: 'İlk 6 bağlantı açıldı' });
  window.api.openConnection(ids.slice(0, 6));
}

function updateSelectionUI() {
  document.querySelectorAll('.conn-card').forEach((x) => x.classList.toggle('selected', selected.has(x.dataset.id)));
  const n = selectedConns().length;
  const b = $('#btnSplit');
  b.classList.toggle('hidden', n < 2);
  b.innerHTML = icon('columns') + `Bölünmüş aç (${n})`;
}

// --- Başlangıç ---------------------------------------------------------------
$('.search-ico').innerHTML = icon('search');
$('#btnSettings').innerHTML = icon('gear');
$('#btnNewFolder').innerHTML = icon('folderPlus') + 'Yeni klasör';
$('#btnNewConn').innerHTML = icon('plus') + 'Yeni bağlantı';

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
const sortByName = (a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });

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
  $('#stats').textContent = nc ? `${nc} bağlantı · ${nf} klasör` : 'Hoş geldiniz';
}

function renderCrumbs() {
  const el = $('#crumbs');
  el.innerHTML = '';
  if (query) {
    el.appendChild(h(`<span class="crumb current">${icon('search')} “${esc(query)}” için sonuçlar</span>`));
    return;
  }
  const parts = [{ id: null, name: 'Tüm bağlantılar' }, ...folderPath(currentFolder)];
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
      <div class="lbl">Yeni</div>
      <div class="hint">İlk SSH bağlantınızı oluşturun.<br>Sunucu bilgilerini girin, test edin ve kaydedin.</div>
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
    grid.appendChild(h('<div class="section-title">Klasörler</div>'));
    for (const f of folders) grid.appendChild(folderCard(f));
  }
  grid.appendChild(h(`<div class="section-title">Bağlantılar${conns.length > 1 ? '<span class="hint">Ctrl+tık ile birden fazla seçip tek pencerede bölünmüş açabilirsiniz</span>' : ''}</div>`));
  for (const c of conns) grid.appendChild(connCard(c));

  if (!query) {
    const n = h(`<div class="new-card"><div class="plus">${icon('plus')}</div><div class="lbl">Yeni</div></div>`);
    n.onclick = () => editConnection(null);
    grid.appendChild(n);
  } else if (!conns.length && !folders.length) {
    grid.appendChild(h('<div class="empty-note" style="grid-column:1/-1">Eşleşen bağlantı bulunamadı.</div>'));
  }
}

function folderCard(f) {
  const n = countIn(f.id);
  const el = h(`<div class="card folder-card" draggable="true">
    <div class="avatar">${icon('folder')}</div>
    <div style="min-width:0">
      <div class="card-title">${esc(f.name)}</div>
      <div class="card-sub">${n} bağlantı</div>
    </div></div>`);
  el.addEventListener('dblclick', () => { $('#search').value = ''; query = ''; goFolder(f.id); });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      { label: 'Aç', icon: 'open', action: () => goFolder(f.id) },
      {
        label: 'Klasördeki bağlantıları bölünmüş aç', icon: 'columns',
        disabled: data.connections.filter((c) => c.folderId === f.id).length < 1,
        action: () => openConns(data.connections.filter((c) => c.folderId === f.id).sort(sortByName).map((c) => c.id)),
      },
      { label: 'Bu klasörde yeni bağlantı', icon: 'plus', action: () => editConnection(null, f.id) },
      { label: 'Alt klasör oluştur', icon: 'folderPlus', action: () => newFolder(f.id) },
      '-',
      { label: 'Yeniden adlandır', icon: 'edit', kbd: 'F2', action: () => renameFolder(f) },
      { label: 'Taşı…', icon: 'move', action: () => moveDialog({ type: 'folder', item: f }) },
      '-',
      { label: 'Sil', icon: 'trash', danger: true, action: () => deleteFolder(f) },
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
      <button class="icon-btn" data-a="edit" title="Düzenle">${icon('edit')}</button>
      <button class="icon-btn connect" data-a="open" title="Bağlan">${icon('play')}</button>
    </div>
    <div class="card-foot">
      ${c.theme && c.theme !== DEFAULT_THEME ? `<span class="tag" title="Konsol renk paleti"><span class="theme-dot" style="background:${getTheme(c.theme).background};border-color:${getTheme(c.theme).green}"></span>${esc(getTheme(c.theme).name)}</span>` : ''}
      ${c.authType === 'key' ? `<span class="tag">${icon('key')}Anahtar</span>` : ''}
      ${c.rememberLastDir ? `<span class="tag dir" title="Son klasör">${icon('history')}${esc(c.lastDir || 'son klasör')}</span>` : ''}
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
        { label: `${multi.length} bağlantıyı tek pencerede bölünmüş aç`, icon: 'columns', kbd: 'Enter', action: () => openConns(multi.map((x) => x.id)) },
        { label: 'Her birini ayrı pencerede aç', icon: 'terminal', action: () => multi.forEach((x) => openConns([x.id])) },
        '-',
        { label: 'Seçimi temizle', icon: 'x', action: () => { selected.clear(); updateSelectionUI(); } },
      ]);
      return;
    }
    contextMenu(e.clientX, e.clientY, [
      { label: 'Bağlan', icon: 'terminal', kbd: 'Enter', action: () => openConns([c.id]) },
      { label: 'Yan yana iki oturum aç', icon: 'columns', action: () => openConns([c.id, c.id]) },
      '-',
      { label: 'Düzenle', icon: 'edit', kbd: 'F2', action: () => editConnection(c) },
      { label: 'Kopyasını oluştur', icon: 'copy', action: () => window.api.duplicateConnection(c.id) },
      { label: 'Klasöre taşı…', icon: 'move', action: () => moveDialog({ type: 'conn', item: c }) },
      c.rememberLastDir && c.lastDir ? { label: 'Son klasörü sıfırla', icon: 'history', action: () => window.api.resetLastDir(c.id) } : null,
      '-',
      { label: 'Sil', icon: 'trash', danger: true, kbd: 'Del', action: () => deleteConnection(c) },
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
      toast('Bağlantı taşındı', { type: 'ok', sub: folderId ? folderById(folderId).name : 'Tüm bağlantılar' });
    } else if (d.type === 'folder' && d.id !== folderId) {
      const ok = await window.api.moveFolder(d.id, folderId);
      if (!ok) toast('Klasör kendi alt klasörüne taşınamaz', { type: 'err' });
    }
  });
}

// --- Klasör işlemleri ----------------------------------------------------------
async function newFolder(parentId = currentFolder) {
  const name = await prompt('Yeni klasör', { label: 'Klasör adı', placeholder: 'ör. Üretim sunucuları', okText: 'Oluştur', iconName: 'folderPlus' });
  if (name) await window.api.saveFolder({ name, parentId: typeof parentId === 'string' ? parentId : currentFolder });
}

async function renameFolder(f) {
  const name = await prompt('Klasörü yeniden adlandır', { label: 'Klasör adı', value: f.name, okText: 'Kaydet' });
  if (name) await window.api.saveFolder({ id: f.id, name });
}

async function deleteFolder(f) {
  const n = countIn(f.id);
  const ok = await confirmBox('Klasörü sil', `<b>${esc(f.name)}</b> klasörü silinecek.${n ? ` İçindeki ${n} bağlantı silinmez, bir üst klasöre taşınır.` : ''}`);
  if (ok) await window.api.deleteFolder(f.id);
}

function folderOptions(selected, excludeId) {
  // Hiyerarşik klasör listesi (select için)
  const out = [`<option value="">Tüm bağlantılar (kök)</option>`];
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
    title: `“${item.name}” taşı`, iconName: 'move',
    body: `<div class="field"><label>Hedef klasör</label><select class="input" id="mv">${folderOptions(current, type === 'folder' ? item.id : null)}</select></div>`,
    buttons: [
      { label: 'İptal', value: null },
      { label: 'Taşı', cls: 'primary', onClick: (m) => ({ v: m.querySelector('#mv').value || null }) },
    ],
  });
  if (!target) return;
  if (type === 'conn') await window.api.moveConnection(item.id, target.v);
  else if (!(await window.api.moveFolder(item.id, target.v))) toast('Klasör kendi alt klasörüne taşınamaz', { type: 'err' });
}

async function deleteConnection(c) {
  const ok = await confirmBox('Bağlantıyı sil', `<b>${esc(c.name)}</b> (${esc(c.username)}@${esc(c.host)}) kalıcı olarak silinecek.`);
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
    <div class="field"><label>Bağlantı adı</label><input class="input" id="f-name" placeholder="ör. Web sunucusu" value="${esc(c.name)}"></div>
    <div class="row c-3-1">
      <div class="field"><label>IP adresi / Sunucu</label><input class="input" id="f-host" placeholder="192.168.1.10 veya sunucu.com" value="${esc(c.host)}" spellcheck="false"></div>
      <div class="field"><label>Port</label><input class="input" id="f-port" type="number" min="1" max="65535" value="${esc(c.port || 22)}"></div>
    </div>
    <div class="field"><label>Kullanıcı adı</label><input class="input" id="f-user" value="${esc(c.username)}" spellcheck="false"></div>
    <div class="field">
      <label>Kimlik doğrulama</label>
      <div class="seg" id="f-auth"><button data-v="password">Şifre</button><button data-v="key">Özel anahtar</button></div>
    </div>
    <div class="field" id="pw-field"><label>Şifre</label>
      <div class="pw-wrap"><input class="input" id="f-pass" type="password" placeholder="${c.hasPassword ? '•••••••• (kayıtlı — değiştirmek için yazın)' : ''}" autocomplete="new-password">
      <button class="icon-btn" id="f-eye" type="button" title="Göster">${icon('eye')}</button></div>
    </div>
    <div id="key-fields" class="hidden" style="display:grid;gap:14px">
      <div class="field"><label>Anahtar dosyası</label>
        <div class="key-wrap"><input class="input" id="f-key" value="${esc(c.keyPath)}" placeholder="C:\\Users\\…\\.ssh\\id_ed25519" spellcheck="false"><button class="btn" id="f-keypick" type="button">Seç…</button></div>
      </div>
      <div class="field"><label>Anahtar parolası (varsa)</label><input class="input" id="f-phrase" type="password" placeholder="${c.hasPassphrase ? '•••••••• (kayıtlı)' : 'Yoksa boş bırakın'}"></div>
    </div>
    <div class="row c-1-1">
      <div class="field"><label>Klasör</label><select class="input" id="f-folder">${folderOptions(c.folderId)}</select></div>
      <div class="field"><label>Renk</label><div class="colors" id="f-colors" style="height:36px;align-items:center"></div></div>
    </div>
    <div class="field"><label>Konsol renk paleti</label><div id="f-theme"></div></div>
    <label class="check"><input type="checkbox" id="f-last"${c.rememberLastDir ? 'checked' : ''}>
      <span>Son kaldığım klasöre git<small>Bağlanınca terminal ve dosya yöneticisi en son çalıştığınız klasörde açılır.${c.lastDir ? ` Şu an: <code>${esc(c.lastDir)}</code>` : ''}</small></span></label>
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
    showResult('', `<span class="spin" style="color:var(--accent);margin-top:2px"></span><div>Bağlanılıyor…</div>`);
    const res = await window.api.testConnection(readForm());
    btn.disabled = false;
    if (res.ok) {
      testedHostKey = res.fingerprint;
      showResult('ok', `${icon('check')}<div><b>Bağlantı başarılı</b> · ${res.ms} ms${res.info ? `<br>${esc(res.info)}` : ''}
        <div class="fp">Host anahtarı (SHA256): ${esc(res.fingerprint)}</div></div>`);
    } else {
      showResult('err', `${icon('x')}<div><b>Bağlantı başarısız</b><br>${esc(res.message)}</div>`);
    }
    return false;
  };

  const save = async (andConnect) => {
    if (!validate()) return false;
    const id = await window.api.saveConnection(readForm());
    toast(isNew ? 'Bağlantı kaydedildi' : 'Değişiklikler kaydedildi', { type: 'ok', sub: q('#f-name').value || q('#f-host').value });
    if (andConnect) window.api.openConnection(id);
    return true;
  };

  await openModal({
    title: isNew ? 'Yeni SSH bağlantısı' : 'Bağlantıyı düzenle',
    iconName: 'server',
    width: 580,
    body,
    buttons: [
      { label: 'Bağlantıyı test et', icon: 'bolt', left: true, onClick: (_m, btn) => runTest(btn) },
      { label: 'İptal', cls: 'ghost', value: null },
      { label: 'Kaydet ve bağlan', onClick: () => save(true) },
      { label: 'Kaydet', cls: 'primary', onClick: () => save(false) },
    ],
  });
}

// --- Ayarlar -----------------------------------------------------------------
async function openSettings() {
  const s = data.settings || {};
  const body = h(`<div style="display:grid;gap:16px">
    <div class="section-title" style="margin:0">Pencere</div>
    <label class="check"><input type="checkbox" id="s-min" ${s.minimizeToTray ? 'checked' : ''}>
      <span>Küçültüldüğünde sistem tepsisinde göster<small>Pencere küçültülünce görev çubuğundan gizlenir ve saatin yanındaki tepside SSH Master simgesi olarak görünür. Simgeye tıklayınca geri açılır; sağ tıkla hızlıca bağlanabilirsiniz.</small></span></label>
    <label class="check"><input type="checkbox" id="s-close" ${s.closeToTray ? 'checked' : ''}>
      <span>Kapatıldığında tepsiye gizle<small>Kapat (X) düğmesi uygulamadan çıkmak yerine onu tepsiye gizler. Çıkmak için tepsi menüsündeki “Çıkış”ı kullanın.</small></span></label>
    <div class="section-title" style="margin:6px 0 0">Terminal</div>
    <div class="field" style="max-width:200px"><label>Yazı boyutu</label>
      <input class="input" id="s-font" type="number" min="9" max="28" value="${esc(s.fontSize || 14)}"></div>
  </div>`);

  const res = await openModal({
    title: 'Ayarlar', iconName: 'gear', width: 520, body,
    buttons: [
      { label: 'İptal', value: null },
      {
        label: 'Kaydet', cls: 'primary',
        onClick: (m) => ({
          minimizeToTray: m.querySelector('#s-min').checked,
          closeToTray: m.querySelector('#s-close').checked,
          fontSize: Math.min(28, Math.max(9, Number(m.querySelector('#s-font').value) || 14)),
        }),
      },
    ],
  });
  if (res) {
    await window.api.setSettings(res);
    data.settings = { ...data.settings, ...res };
    toast('Ayarlar kaydedildi', { type: 'ok' });
  }
}
