'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog, Tray, Menu, nativeImage, clipboard, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { Client } = require('ssh2');
const I18N = require('./i18n');

// Arayüz dili: ayarlarda seçilen ya da sistem dili (desteklenmiyorsa İngilizce)
let t = I18N.createT('en');
const currentLang = () => (store && store.settings.language) || I18N.resolveLanguage(app.getLocale());
function applyLanguage() { t = I18N.createT(currentLang()); }

const ICON = path.join(__dirname, '..', 'build', 'icon.png');

// ---------------------------------------------------------------------------
// Kalıcı depo (userData/store.json)
// ---------------------------------------------------------------------------
const storePath = () => path.join(app.getPath('userData'), 'store.json');

const defaultStore = () => ({
  folders: [],      // { id, name, parentId }
  connections: [],  // { id, name, host, port, username, authType, password, keyPath, passphrase, folderId, rememberLastDir, lastDir, color, hostKey }
  shortcuts: [
    { id: uid(), name: t('main.defDisk'), command: 'df -h', enter: true },
    { id: uid(), name: t('main.defMem'), command: 'free -m', enter: true },
    { id: uid(), name: t('main.defTop'), command: 'top', enter: true },
  ],
  settings: {
    localDir: os.homedir(),
    sidebarWidth: 320,
    sidebarOpen: true,
    panelSizes: [1, 2, 2],
    minimizeToTray: true,  // küçültülünce sistem tepsisine gizle
    closeToTray: false,    // kapat (X) düğmesi uygulamayı tepsiye gizler
    fontSize: 14,          // terminal yazı boyutu
    appTheme: 'dark',      // 'dark' | 'light' | 'system'
    language: null,        // null = sistem dili (desteklenmiyorsa İngilizce)
    transfersInBackground: false, // büyük aktarımlar doğrudan arka planda
  },
});

let store = null;

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function loadStore() {
  applyLanguage(); // varsayılan veriler sistem dilinde oluşsun
  try {
    store = { ...defaultStore(), ...JSON.parse(fs.readFileSync(storePath(), 'utf8')) };
    store.settings = { ...defaultStore().settings, ...(store.settings || {}) };
  } catch {
    store = defaultStore();
  }
  applyAppTheme();
  applyLanguage();
}

// Gece / Gündüz / Sistem: tüm pencerelerin prefers-color-scheme'ini ve başlık çubuklarını belirler
function applyAppTheme() {
  const v = store.settings.appTheme;
  nativeTheme.themeSource = v === 'light' || v === 'system' ? v : 'dark';
}
const windowBg = () => (nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#eef2f7');

let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8');
  }, 150);
}

function encrypt(text) {
  if (!text) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
  return 'b64:' + Buffer.from(text, 'utf8').toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8');
  return value;
}

// Arayüze gönderilen kopya: şifreler asla renderer'a gitmez.
function publicStore() {
  return {
    folders: store.folders,
    shortcuts: store.shortcuts,
    settings: store.settings,
    connections: store.connections.map((c) => {
      const { password, passphrase, hostKey, ...rest } = c;
      return { ...rest, hasPassword: !!password, hasPassphrase: !!passphrase };
    }),
  };
}

function broadcastStore() {
  if (tray) tray.setContextMenu(buildTrayMenu());
  const data = publicStore();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('store:changed', data);
}

// ---------------------------------------------------------------------------
// SSH yardımcıları
// ---------------------------------------------------------------------------

// Form verisi + kayıtlı bağlantıdan ssh2 bağlantı ayarlarını üretir.
function buildConnectConfig(conn, onHostKey) {
  const cfg = {
    host: String(conn.host || '').trim(),
    port: Number(conn.port) || 22,
    username: String(conn.username || '').trim(),
    readyTimeout: 15000,
    keepaliveInterval: 20000,
    tryKeyboard: true,
    hostVerifier: (key) => onHostKey(crypto.createHash('sha256').update(key).digest('base64')),
  };
  if (conn.authType === 'key' && conn.keyPath) {
    cfg.privateKey = fs.readFileSync(conn.keyPath);
    if (conn.passphrase) cfg.passphrase = conn.passphrase;
  } else {
    cfg.password = conn.password || '';
  }
  return cfg;
}

// Kayıtlı bağlantının çözülmüş (şifreli alanları açılmış) hali.
function resolveConnection(id) {
  const c = store.connections.find((x) => x.id === id);
  if (!c) throw new Error(t('main.errConnNotFound'));
  return { ...c, password: decrypt(c.password), passphrase: decrypt(c.passphrase) };
}

// Formdan gelen veri; boş şifre alanı düzenlemede "değiştirme" anlamına gelir.
function mergeFormWithStored(form) {
  const stored = form.id ? store.connections.find((x) => x.id === form.id) : null;
  return {
    ...form,
    password: form.password || (stored ? decrypt(stored.password) : ''),
    passphrase: form.passphrase || (stored ? decrypt(stored.passphrase) : ''),
    hostKey: stored ? stored.hostKey : null,
  };
}

function connectClient(conn, { onKeyboard } = {}) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let fingerprint = null;
    let hostKeyMismatch = false;

    client.on('keyboard-interactive', (name, instr, lang, prompts, finish) => {
      // Klavye etkileşimli kimlik doğrulama: tüm sorulara kayıtlı şifreyi ver.
      if (onKeyboard) onKeyboard(prompts);
      finish(prompts.map(() => conn.password || ''));
    });

    client.on('ready', () => resolve({ client, fingerprint }));
    client.on('error', (err) => {
      if (hostKeyMismatch) {
        reject(new Error(t('main.errHostKey', { old: conn.hostKey, new: fingerprint })));
      } else {
        reject(err);
      }
    });

    try {
      client.connect(
        buildConnectConfig(conn, (fp) => {
          fingerprint = fp;
          if (conn.hostKey && conn.hostKey !== fp && !conn.acceptNewHostKey) {
            hostKeyMismatch = true;
            return false;
          }
          return true;
        })
      );
    } catch (err) {
      reject(err);
    }
  });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err);
  if (/All configured authentication methods failed/i.test(msg)) return t('main.errAuth');
  if (/ECONNREFUSED/i.test(msg)) return t('main.errRefused');
  if (/ETIMEDOUT|Timed out/i.test(msg)) return t('main.errTimeout');
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return t('main.errDns');
  if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) return t('main.errUnreach');
  if (/ENOENT/i.test(msg)) return t('main.errKeyFile');
  return msg;
}

function rememberHostKey(id, fingerprint) {
  const c = store.connections.find((x) => x.id === id);
  if (c && fingerprint && c.hostKey !== fingerprint) {
    c.hostKey = fingerprint;
    saveStore();
  }
}

// ---------------------------------------------------------------------------
// Pencereler
// ---------------------------------------------------------------------------
let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 500,
    backgroundColor: windowBg(),
    title: 'SSH Master',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('minimize', (e) => {
    if (!store.settings.minimizeToTray) return;
    e.preventDefault();
    hideToTray();
  });
  mainWindow.on('close', (e) => {
    if (store.settings.closeToTray && !isQuitting) {
      e.preventDefault();
      hideToTray();
    }
  });
  mainWindow.on('show', destroyTray);
  mainWindow.on('closed', () => (mainWindow = null));
}

// ---------------------------------------------------------------------------
// Sistem tepsisi (tray)
// ---------------------------------------------------------------------------
let tray = null;
let isQuitting = false;

function showMainWindow() {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  ensureTray();
  mainWindow.hide();
  if (!store.settings.trayHintShown) {
    store.settings.trayHintShown = true;
    saveStore();
    tray.displayBalloon({
      iconType: 'info',
      title: t('main.balloonTitle'),
      content: t('main.balloonBody'),
    });
  }
}

function buildTrayMenu() {
  // Hızlı bağlan: klasör yapısına göre alt menüler
  const connItems = (folderId) => {
    const items = [];
    for (const f of store.folders.filter((x) => (x.parentId || null) === folderId).sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
      const sub = connItems(f.id);
      if (sub.length) items.push({ label: f.name, submenu: sub });
    }
    for (const c of store.connections.filter((x) => (x.folderId || null) === folderId).sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
      items.push({ label: `${c.name}  (${c.username}@${c.host})`, click: () => openTerminalWindow(c.id) });
    }
    return items;
  };
  const conns = connItems(null);
  return Menu.buildFromTemplate([
    { label: t('main.trayShow'), click: showMainWindow },
    { type: 'separator' },
    { label: t('main.trayQuick'), submenu: conns.length ? conns : [{ label: t('main.trayNone'), enabled: false }] },
    { type: 'separator' },
    { label: t('main.trayQuit'), click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function ensureTray() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    return;
  }
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(img);
  tray.setToolTip('SSH Master');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// Bir terminal penceresi bir veya daha fazla bağlantıyı bölmeler halinde açar
function openTerminalWindow(ids) {
  ids = (Array.isArray(ids) ? ids : [ids]).filter((id) => store.connections.some((c) => c.id === id));
  if (!ids.length) return;
  const first = store.connections.find((c) => c.id === ids[0]);
  const win = new BrowserWindow({
    width: ids.length > 1 ? 1500 : 1280,
    height: ids.length > 2 ? 920 : 800,
    minWidth: 700,
    minHeight: 420,
    backgroundColor: windowBg(),
    title: ids.length > 1 ? `${t('term.sessions', { n: ids.length })} — SSH Master` : `${first.name} — SSH Master`,
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'terminal.html'), { query: { ids: ids.join(',') } });
  const wcId = win.webContents.id;
  win.on('closed', () => closeWindowSessions(wcId));
}

// ---------------------------------------------------------------------------
// Terminal oturumları: her bölme (pane) kendi SSH bağlantısına sahiptir
// ---------------------------------------------------------------------------
const sessions = new Map(); // `${webContents.id}:${paneId}` -> { client, stream, sftp, connId }
const skey = (event, pane) => `${event.sender.id}:${pane}`;

function closeSession(key) {
  const s = sessions.get(key);
  if (!s) return;
  sessions.delete(key);
  try { s.stream && s.stream.end(); } catch {}
  try { s.client.end(); } catch {}
}

function closeWindowSessions(wcId) {
  for (const key of [...sessions.keys()]) if (key.startsWith(wcId + ':')) closeSession(key);
}

function getSession(event, pane) {
  const s = sessions.get(skey(event, pane));
  if (!s) throw new Error(t('main.errNoSession'));
  return s;
}

function getSftp(s) {
  if (s.sftp) return Promise.resolve(s.sftp);
  if (s.sftpPromise) return s.sftpPromise;
  s.sftpPromise = new Promise((resolve, reject) => {
    s.client.sftp((err, sftp) => {
      s.sftpPromise = null;
      if (err) return reject(err);
      s.sftp = sftp;
      sftp.on('close', () => (s.sftp = null));
      resolve(sftp);
    });
  });
  return s.sftpPromise;
}

const paneSftp = (event, pane) => getSftp(getSession(event, pane));

const shQuote = (p) => `'${String(p).replace(/'/g, `'\\''`)}'`;

// Kabuk her prompt'ta OSC 7 ile bulunduğu klasörü bildirir (bash + zsh).
const OSC7_INIT =
  "__sm_osc7(){ printf '\\033]7;file://%s\\007' \"$PWD\"; }; " +
  'PROMPT_COMMAND="__sm_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; ' +
  'precmd_functions+=(__sm_osc7) 2>/dev/null';

ipcMain.handle('ssh:start', async (event, { pane, connId, cols, rows }) => {
  const wc = event.sender;
  const key = skey(event, pane);
  closeSession(key);
  let conn;
  try {
    conn = resolveConnection(connId);
  } catch (err) {
    return { ok: false, message: err.message };
  }

  let result;
  try {
    result = await connectClient(conn);
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
  const { client, fingerprint } = result;
  rememberHostKey(connId, fingerprint);

  const session = { client, stream: null, sftp: null, connId };
  sessions.set(key, session);

  client.on('close', () => {
    if (sessions.get(key) === session) {
      sessions.delete(key);
      if (!wc.isDestroyed()) wc.send('ssh:closed', { pane });
    }
  });

  return new Promise((resolve) => {
    client.shell({ term: 'xterm-256color', cols: cols || 120, rows: rows || 30 }, (err, stream) => {
      if (err) return resolve({ ok: false, message: friendlyError(err) });
      session.stream = stream;
      const send = (d) => !wc.isDestroyed() && wc.send('ssh:data', { pane, data: d.toString('utf8') });
      stream.on('data', send);
      stream.stderr.on('data', send);
      stream.on('close', () => client.end());

      // Son klasörü takip et / oraya git
      if (conn.rememberLastDir) {
        let init = ' ' + OSC7_INIT;
        if (conn.lastDir) init += `; cd -- ${shQuote(conn.lastDir)} 2>/dev/null`;
        init += '; clear\r'; // Enter tuşuyla aynı (PTY \r'yi satır sonuna çevirir)
        stream.write(init);
      }
      resolve({
        ok: true,
        startDir: conn.rememberLastDir && conn.lastDir ? conn.lastDir : null,
        name: conn.name,
        host: conn.host,
        username: conn.username,
      });
    });
  });
});

ipcMain.on('ssh:write', (event, { pane, data }) => {
  const s = sessions.get(skey(event, pane));
  if (s && s.stream) s.stream.write(data);
});

ipcMain.on('ssh:resize', (event, { pane, cols, rows }) => {
  const s = sessions.get(skey(event, pane));
  if (s && s.stream) s.stream.setWindow(rows, cols, 0, 0);
});

ipcMain.on('ssh:stop', (event, { pane }) => closeSession(skey(event, pane)));

ipcMain.on('ssh:lastDir', (event, { pane, dir }) => {
  const s = sessions.get(skey(event, pane));
  if (!s || !dir) return;
  const c = store.connections.find((x) => x.id === s.connId);
  if (c && c.rememberLastDir && c.lastDir !== dir) {
    c.lastDir = dir;
    saveStore();
  }
});

// ---------------------------------------------------------------------------
// SFTP (uzak dosya yöneticisi)
// ---------------------------------------------------------------------------
const posix = path.posix;

ipcMain.handle('sftp:realpath', async (event, { pane, p }) => {
  const sftp = await paneSftp(event, pane);
  return new Promise((resolve, reject) => sftp.realpath(p || '.', (err, abs) => (err ? reject(err) : resolve(abs))));
});

ipcMain.handle('sftp:list', async (event, { pane, dir }) => {
  const sftp = await paneSftp(event, pane);
  return new Promise((resolve, reject) => {
    sftp.readdir(dir, (err, list) => {
      if (err) return reject(new Error(friendlyError(err)));
      resolve(
        list
          .filter((e) => e.filename !== '.' && e.filename !== '..')
          .map((e) => {
            const mode = e.attrs.mode;
            const isDir = (mode & 0o170000) === 0o040000;
            const isLink = (mode & 0o170000) === 0o120000;
            return {
              name: e.filename,
              path: posix.join(dir, e.filename),
              isDir,
              isLink,
              size: e.attrs.size,
              mtime: e.attrs.mtime * 1000,
            };
          })
      );
    });
  });
});

// Sembolik bağlantının klasör olup olmadığını öğren
ipcMain.handle('sftp:stat', async (event, { pane, p }) => {
  const sftp = await paneSftp(event, pane);
  return new Promise((resolve, reject) =>
    sftp.stat(p, (err, st) => (err ? reject(err) : resolve({ isDir: st.isDirectory(), size: st.size })))
  );
});

const sftpCall = (sftp, fn, ...args) =>
  new Promise((resolve, reject) => sftp[fn](...args, (err, res) => (err ? reject(err) : resolve(res))));

async function remoteWalk(sftp, root) {
  // root altındaki tüm dosyaları { rel, size } olarak döndürür; klasörleri ayrıca listeler
  const files = [];
  const dirs = [''];
  const queue = [''];
  while (queue.length) {
    const rel = queue.shift();
    const list = await sftpCall(sftp, 'readdir', posix.join(root, rel));
    for (const e of list) {
      if (e.filename === '.' || e.filename === '..') continue;
      const r = rel ? posix.join(rel, e.filename) : e.filename;
      const type = e.attrs.mode & 0o170000;
      if (type === 0o040000) {
        dirs.push(r);
        queue.push(r);
      } else if (type === 0o100000) {
        files.push({ rel: r, size: e.attrs.size });
      }
    }
  }
  return { files, dirs };
}

function localWalk(root) {
  const files = [];
  const dirs = [''];
  const queue = [''];
  while (queue.length) {
    const rel = queue.shift();
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        dirs.push(r);
        queue.push(r);
      } else if (e.isFile()) {
        files.push({ rel: r, size: fs.statSync(path.join(root, r)).size });
      }
    }
  }
  return { files, dirs };
}

// Aynı isimde dosya varsa "ad (1).ext" şeklinde yeni isim üretir
function uniqueLocalPath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 1; ; i++) {
    const cand = path.join(dir, `${name} (${i})${ext}`);
    if (!fs.existsSync(cand)) return cand;
  }
}

// ---------------------------------------------------------------------------
// Aktarımlar: her aktarım kendi SFTP kanalını açar (iptal = kanalı kapatmak),
// böylece aktarım sürerken dosya listesi de takılmaz.
// ---------------------------------------------------------------------------
const transfers = new Map(); // id -> { cancelled, sftp }

function openSftpChannel(s) {
  return new Promise((resolve, reject) => s.client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp))));
}

function makeProgress(wc, base) {
  const state = { ...base, phase: 'scan', total: 0, done: 0, files: 0, fileIndex: 0, current: '' };
  let last = 0;
  const send = () => !wc.isDestroyed() && wc.send('transfer:progress', { ...state });
  return {
    state,
    send,
    add(n) {
      state.done += n;
      const now = Date.now();
      if (now - last > 150) { last = now; send(); }
    },
    file(i, rel) { state.fileIndex = i; state.current = rel; send(); },
    finish(phase, error) { state.phase = phase; state.error = error || null; send(); },
  };
}

// Paralel parça aktarımı (ssh2 fastGet/fastPut ile aynı yaklaşım: 64 eşzamanlı 32 KB istek).
// Farkı: dosya tanıtıcıları bizde olduğu için iptalde hemen kapatılır; fastGet kanal kapanınca
// geri dönmüyor ve yerel dosyayı uygulama kapanana kadar açık tutuyordu.
const CHUNK = 32768;
const CONCURRENCY = 64;

const sftpRead = (sftp, handle, buf, off, len, pos) =>
  new Promise((resolve, reject) => sftp.read(handle, buf, off, len, pos, (err, n) => (err ? reject(err) : resolve(n))));
const sftpWrite = (sftp, handle, buf, off, len, pos) =>
  new Promise((resolve, reject) => sftp.write(handle, buf, off, len, pos, (err) => (err ? reject(err) : resolve())));

async function parallelChunks(size, job, copyChunk) {
  let next = 0;
  const worker = async () => {
    while (next < size) {
      if (job.cancelled) throw new Error('cancelled');
      const pos = next;
      const len = Math.min(CHUNK, size - pos);
      next += len;
      await copyChunk(pos, len);
    }
  };
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.ceil(size / CHUNK) || 1) }, worker);
  await Promise.all(workers);
}

// Uzak dosyayı yerel yola indir
async function xferDownload(sftp, remotePath, localPath, onStep, job) {
  const rh = await sftpCall(sftp, 'open', remotePath, 'r');
  const fh = await fs.promises.open(localPath, 'w');
  job.closers.push(() => fh.close().catch(() => {}));
  try {
    const { size } = await sftpCall(sftp, 'fstat', rh);
    await parallelChunks(size, job, async (pos, len) => {
      const buf = Buffer.allocUnsafe(len);
      let got = 0;
      while (got < len) { // sunucu istenenden az dönebilir
        const n = await sftpRead(sftp, rh, buf, got, len - got, pos + got);
        if (!n) break;
        got += n;
      }
      await fh.write(buf, 0, got, pos);
      onStep(got);
    });
  } finally {
    await fh.close().catch(() => {});
    sftp.close(rh, () => {});
  }
}

// Yerel dosyayı uzak yola yükle
async function xferUpload(sftp, localPath, remotePath, onStep, job) {
  const fh = await fs.promises.open(localPath, 'r');
  job.closers.push(() => fh.close().catch(() => {}));
  let wh = null;
  try {
    const { size } = await fh.stat();
    wh = await sftpCall(sftp, 'open', remotePath, 'w');
    await parallelChunks(size, job, async (pos, len) => {
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos);
      await sftpWrite(sftp, wh, buf, 0, bytesRead, pos);
      onStep(bytesRead);
    });
  } finally {
    await fh.close().catch(() => {});
    if (wh) sftp.close(wh, () => {});
  }
}

async function runTransfer(event, { id, pane, kind, name }, work, cleanup) {
  const wc = event.sender;
  const job = { cancelled: false, sftp: null, closers: [] };
  // İptal, süren parça isteklerini beklemeden aktarımı hemen sonlandırır
  const cancelled = new Promise((_, reject) => (job.abort = () => reject(new Error('cancelled'))));
  cancelled.catch(() => {});
  transfers.set(id, job);
  const progress = makeProgress(wc, { id, pane, kind, name });
  progress.send();
  try {
    job.sftp = await Promise.race([openSftpChannel(getSession(event, pane)), cancelled]);
    await Promise.race([work(job.sftp, progress, job), cancelled]);
    progress.finish('done');
    return { ok: true };
  } catch (err) {
    if (job.cancelled) {
      await retryCleanup(cleanup);
      progress.finish('cancelled');
      return { ok: false, cancelled: true };
    }
    progress.finish('error', friendlyError(err));
    return { ok: false, message: friendlyError(err) };
  } finally {
    transfers.delete(id);
    job.closers.forEach((close) => close());
    closeChannel(job.sftp);
  }
}

const checkCancel = (job) => { if (job.cancelled) throw new Error('cancelled'); };

function closeChannel(sftp) {
  if (!sftp) return;
  try { sftp.end(); } catch {}
  try { sftp.destroy && sftp.destroy(); } catch {}
}

// Yarım dosya, kapanmakta olan tanıtıcı bırakılana kadar kısa süre kilitli kalabilir; birkaç kez dene
async function retryCleanup(cleanup) {
  for (let i = 0; i < 8; i++) {
    try { await cleanup(); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}

ipcMain.on('transfer:cancel', (_e, id) => {
  const job = transfers.get(id);
  if (!job) return;
  job.cancelled = true;
  job.closers.forEach((close) => close()); // yerel dosyaları hemen bırak
  closeChannel(job.sftp);
  job.abort();
});

ipcMain.handle('sftp:download', async (event, { pane, id, remotePath, isDir, localDir }) => {
  const name = posix.basename(remotePath);
  let target = null;
  return runTransfer(event, { id, pane, kind: 'download', name }, async (sftp, progress, job) => {
    const st = await sftpCall(sftp, 'stat', remotePath);
    isDir = st.isDirectory();
    target = uniqueLocalPath(path.join(localDir, name));
    if (isDir) {
      const { files, dirs } = await remoteWalk(sftp, remotePath);
      Object.assign(progress.state, { phase: 'transfer', total: files.reduce((a, f) => a + f.size, 0), files: files.length });
      progress.send();
      for (const d of dirs) fs.mkdirSync(path.join(target, ...d.split('/')), { recursive: true });
      for (let i = 0; i < files.length; i++) {
        checkCancel(job);
        const f = files[i];
        progress.file(i + 1, f.rel);
        await xferDownload(sftp, posix.join(remotePath, f.rel), path.join(target, ...f.rel.split('/')), (n) => progress.add(n), job);
      }
    } else {
      Object.assign(progress.state, { phase: 'transfer', total: st.size, files: 1, fileIndex: 1, current: name });
      progress.send();
      await xferDownload(sftp, remotePath, target, (n) => progress.add(n), job);
    }
    checkCancel(job);
  }, async () => {
    // İptalde yarım inen dosya/klasörü sil (yalnızca bu aktarımın oluşturduğu yeni hedef)
    if (target) fs.rmSync(target, { recursive: true, force: true });
  });
});

async function remoteExists(sftp, p) {
  try {
    await sftpCall(sftp, 'stat', p);
    return true;
  } catch {
    return false;
  }
}

async function uniqueRemotePath(sftp, p) {
  if (!(await remoteExists(sftp, p))) return p;
  const dir = posix.dirname(p);
  const ext = posix.extname(p);
  const base = posix.basename(p, ext);
  for (let i = 1; ; i++) {
    const cand = posix.join(dir, `${base} (${i})${ext}`);
    if (!(await remoteExists(sftp, cand))) return cand;
  }
}

async function remoteRemove(sftp, p) {
  let st;
  try { st = await sftpCall(sftp, 'lstat', p); } catch { return; }
  if (!st.isDirectory()) return sftpCall(sftp, 'unlink', p);
  const { files, dirs } = await remoteWalk(sftp, p);
  for (const f of files) await sftpCall(sftp, 'unlink', posix.join(p, f.rel));
  for (const d of dirs.sort((a, b) => b.length - a.length)) await sftpCall(sftp, 'rmdir', d ? posix.join(p, d) : p);
}

ipcMain.handle('sftp:upload', async (event, { pane, id, localPath, remoteDir }) => {
  const name = path.basename(localPath);
  let target = null;
  return runTransfer(event, { id, pane, kind: 'upload', name }, async (sftp, progress, job) => {
    const st = fs.statSync(localPath);
    target = await uniqueRemotePath(sftp, posix.join(remoteDir, name));
    if (st.isDirectory()) {
      const { files, dirs } = localWalk(localPath);
      Object.assign(progress.state, { phase: 'transfer', total: files.reduce((a, f) => a + f.size, 0), files: files.length });
      progress.send();
      for (const d of dirs) {
        const rp = d ? posix.join(target, ...d.split(path.sep)) : target;
        try { await sftpCall(sftp, 'mkdir', rp); } catch { /* zaten var */ }
      }
      for (let i = 0; i < files.length; i++) {
        checkCancel(job);
        const f = files[i];
        progress.file(i + 1, f.rel.split(path.sep).join('/'));
        await xferUpload(sftp, path.join(localPath, f.rel), posix.join(target, ...f.rel.split(path.sep)), (n) => progress.add(n), job);
      }
    } else {
      Object.assign(progress.state, { phase: 'transfer', total: st.size, files: 1, fileIndex: 1, current: name });
      progress.send();
      await xferUpload(sftp, localPath, target, (n) => progress.add(n), job);
    }
    checkCancel(job);
  }, async () => {
    // İptalde sunucuya yarım yüklenen hedefi, bölmenin ana SFTP kanalıyla sil
    if (target) await remoteRemove(await paneSftp(event, pane), target);
  });
});

ipcMain.handle('sftp:mkdir', async (event, { pane, p }) => {
  const sftp = await paneSftp(event, pane);
  await sftpCall(sftp, 'mkdir', p);
  return true;
});

ipcMain.handle('sftp:rename', async (event, { pane, from, to }) => {
  const sftp = await paneSftp(event, pane);
  await sftpCall(sftp, 'rename', from, to);
  return true;
});

ipcMain.handle('sftp:delete', async (event, { pane, p, isDir }) => {
  const sftp = await paneSftp(event, pane);
  if (!isDir) {
    await sftpCall(sftp, 'unlink', p);
    return true;
  }
  const { files, dirs } = await remoteWalk(sftp, p);
  for (const f of files) await sftpCall(sftp, 'unlink', posix.join(p, f.rel));
  for (const d of dirs.sort((a, b) => b.length - a.length)) await sftpCall(sftp, 'rmdir', d ? posix.join(p, d) : p);
  return true;
});

// ---------------------------------------------------------------------------
// Yerel (Windows) dosya yöneticisi
// ---------------------------------------------------------------------------
ipcMain.handle('local:list', async (_e, dir) => {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    let size = 0;
    let mtime = 0;
    let isDir = e.isDirectory();
    try {
      const st = await fs.promises.stat(full);
      size = st.size;
      mtime = st.mtimeMs;
      isDir = st.isDirectory();
    } catch { /* erişilemeyen sistem dosyaları */ }
    out.push({ name: e.name, path: full, isDir, size, mtime });
  }
  return out;
});

ipcMain.handle('local:drives', async () => {
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const d = String.fromCharCode(c) + ':\\';
    try {
      await fs.promises.access(d);
      drives.push(d);
    } catch {}
  }
  return drives;
});

ipcMain.handle('local:special', () => ({
  home: os.homedir(),
  desktop: app.getPath('desktop'),
  downloads: app.getPath('downloads'),
  documents: app.getPath('documents'),
}));

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text ?? '')));

ipcMain.handle('local:open',(_e, p) => shell.openPath(p));
ipcMain.handle('local:reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('local:mkdir', (_e, p) => fs.promises.mkdir(p));

// ---------------------------------------------------------------------------
// Depo işlemleri
// ---------------------------------------------------------------------------
ipcMain.handle('store:get', () => publicStore());
ipcMain.on('app:lang', (e) => { e.returnValue = currentLang(); });

ipcMain.handle('conn:save', (_e, form) => {
  let c = form.id ? store.connections.find((x) => x.id === form.id) : null;
  if (!c) {
    c = { id: uid(), createdAt: Date.now() };
    store.connections.push(c);
  }
  // Host veya port değiştiyse eski host anahtarını unut
  if (c.host && (c.host !== form.host || Number(c.port) !== Number(form.port))) c.hostKey = null;
  Object.assign(c, {
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port) || 22,
    username: form.username.trim(),
    authType: form.authType === 'key' ? 'key' : 'password',
    keyPath: form.keyPath || '',
    folderId: form.folderId ?? c.folderId ?? null,
    rememberLastDir: !!form.rememberLastDir,
    color: form.color || c.color || '#3b82f6',
    theme: form.theme || c.theme || 'sshmaster', // konsol renk paleti
    notes: form.notes || '',
  });
  if (!c.rememberLastDir) c.lastDir = '';
  if (form.password) c.password = encrypt(form.password);
  if (form.clearPassword) c.password = '';
  if (form.passphrase) c.passphrase = encrypt(form.passphrase);
  if (form.testedHostKey && !c.hostKey) c.hostKey = form.testedHostKey;
  saveStore();
  broadcastStore();
  return c.id;
});

ipcMain.handle('conn:delete', (_e, id) => {
  store.connections = store.connections.filter((c) => c.id !== id);
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:duplicate', (_e, id) => {
  const c = store.connections.find((x) => x.id === id);
  if (!c) return;
  store.connections.push({ ...c, id: uid(), name: c.name + t('main.copySuffix'), createdAt: Date.now(), lastDir: '' });
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:move', (_e, { id, folderId }) => {
  const c = store.connections.find((x) => x.id === id);
  if (c) c.folderId = folderId || null;
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:setTheme', (_e, { id, theme }) => {
  const c = store.connections.find((x) => x.id === id);
  if (c) c.theme = theme;
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:resetLastDir', (_e, id) => {
  const c = store.connections.find((x) => x.id === id);
  if (c) c.lastDir = '';
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:test', async (_e, form) => {
  const conn = mergeFormWithStored(form);
  if (!conn.host || !conn.username) return { ok: false, message: t('main.errHostUser') };
  const started = Date.now();
  try {
    const { client, fingerprint } = await connectClient(conn);
    // Küçük bir komutla sunucu bilgisi al
    const info = await new Promise((resolve) => {
      client.exec('uname -sr 2>/dev/null; hostname 2>/dev/null', (err, stream) => {
        if (err) return resolve('');
        let out = '';
        stream.on('data', (d) => (out += d));
        stream.on('close', () => resolve(out.trim().split('\n').join(' · ')));
      });
    });
    client.end();
    return { ok: true, ms: Date.now() - started, fingerprint, info, firstTime: !conn.hostKey };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
});

ipcMain.handle('conn:open', (_e, ids) => openTerminalWindow(ids));

ipcMain.handle('dialog:pickKey', async (event) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: t('main.pickKey'),
    defaultPath: path.join(os.homedir(), '.ssh'),
    properties: ['openFile', 'showHiddenFiles'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('folder:save', (_e, { id, name, parentId }) => {
  let f = id ? store.folders.find((x) => x.id === id) : null;
  if (!f) {
    f = { id: uid(), parentId: parentId || null };
    store.folders.push(f);
  }
  f.name = name.trim();
  saveStore();
  broadcastStore();
  return f.id;
});

ipcMain.handle('folder:move', (_e, { id, parentId }) => {
  // Bir klasörü kendi alt klasörüne taşımayı engelle
  let p = parentId;
  while (p) {
    if (p === id) return false;
    p = (store.folders.find((x) => x.id === p) || {}).parentId;
  }
  const f = store.folders.find((x) => x.id === id);
  if (f) f.parentId = parentId || null;
  saveStore();
  broadcastStore();
  return true;
});

ipcMain.handle('folder:delete', (_e, id) => {
  const f = store.folders.find((x) => x.id === id);
  if (!f) return;
  // İçerik üst klasöre taşınır
  for (const c of store.connections) if (c.folderId === id) c.folderId = f.parentId || null;
  for (const sub of store.folders) if (sub.parentId === id) sub.parentId = f.parentId || null;
  store.folders = store.folders.filter((x) => x.id !== id);
  saveStore();
  broadcastStore();
});

ipcMain.handle('shortcut:save', (_e, s) => {
  let item = s.id ? store.shortcuts.find((x) => x.id === s.id) : null;
  if (!item) {
    item = { id: uid() };
    store.shortcuts.push(item);
  }
  Object.assign(item, { name: s.name.trim() || s.command.trim(), command: s.command, enter: !!s.enter });
  saveStore();
  broadcastStore();
});

ipcMain.handle('shortcut:delete', (_e, id) => {
  store.shortcuts = store.shortcuts.filter((x) => x.id !== id);
  saveStore();
  broadcastStore();
});

ipcMain.handle('shortcut:reorder', (_e, ids) => {
  const map = new Map(store.shortcuts.map((s) => [s.id, s]));
  store.shortcuts = ids.map((id) => map.get(id)).filter(Boolean);
  saveStore();
  broadcastStore();
});

ipcMain.handle('settings:set', (_e, patch) => {
  Object.assign(store.settings, patch);
  saveStore();
  if ('appTheme' in patch) applyAppTheme();
  if ('language' in patch) {
    applyLanguage();
    if (tray) tray.setContextMenu(buildTrayMenu());
    if (mainWindow) mainWindow.webContents.reload();
  }
  if (['fontSize', 'minimizeToTray', 'closeToTray', 'appTheme', 'language', 'transfersInBackground'].some((k) => k in patch)) broadcastStore();
});

// ---------------------------------------------------------------------------
app.setAppUserModelId('com.sshmaster.app');

// Terminaldeki bağlantılar uygulama içinde değil, varsayılan tarayıcıda açılsın
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e) => e.preventDefault());
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', () => (isQuitting = true));

  app.whenReady().then(() => {
    loadStore();
    createMainWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createMainWindow());
  });

  app.on('window-all-closed', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8');
    }
    app.quit();
  });
}
