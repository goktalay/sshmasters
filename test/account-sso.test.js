'use strict';
// Ortak oturum (SSO) akışları: sahte sshmasters.com sunucusu + bellek içi kimlik deposu.
// Aynı kimlik deposunu ve durum klasörünü paylaşan iki createAccount örneği, aynı bilgisayardaki
// iki Mastertool uygulamasını temsil eder.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const { createSso } = require('../src/sso');
const { memoryKeyring, tmpDir } = require('./helpers');

const EMAIL = 'demo@example.com';
const PASSWORD = 'dogru-parola';
const KDF = { alg: 'PBKDF2-SHA256', iter: 1000, salt: crypto.randomBytes(16).toString('base64') };

// --- Sahte sunucu -------------------------------------------------------------
function createServer(authHash) {
  const st = { seq: 0, sso: new Map(), tokens: new Map(), appDisabled: false, library: { version: null, blob: null }, calls: [] };
  const user = { id: 7, email: EMAIL, name: 'Demo Kullanıcı' };
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const err = (res, code, c) => send(res, code, { code: c, message: c });
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
      const route = `${req.method} ${req.url}`;
      st.calls.push({ route, body });
      const authed = () => {
        const t = st.tokens.get(bearer);
        if (!t || t.dead) { err(res, 401, 'session_expired'); return null; }
        return t;
      };
      switch (route) {
        case 'POST /api/sm/auth/prelogin': return send(res, 200, { kdf: KDF });
        case 'POST /api/sm/auth/login': {
          if (body.auth_hash !== authHash) return err(res, 401, 'bad_credentials');
          const token = `app-${++st.seq}`;
          let sso_token;
          if (body.sso) { sso_token = `sso-${st.seq}`; st.sso.set(sso_token, { alive: true }); }
          st.tokens.set(token, { family: sso_token || null });
          return send(res, 200, { token, ...(sso_token ? { sso_token } : {}), user, kdf: KDF, sync_enabled: true });
        }
        case 'POST /api/sm/auth/sso': {
          const s = st.sso.get(body.sso_token);
          if (!s || !s.alive) return err(res, 401, 'session_expired');
          if (st.appDisabled) return err(res, 403, 'app_disabled');
          const token = `app-${++st.seq}`;
          st.tokens.set(token, { family: body.sso_token });
          return send(res, 200, { token, user, kdf: KDF, sync_enabled: true });
        }
        case 'POST /api/sm/auth/logout': {
          const t = st.tokens.get(bearer);
          let sso_ended = false;
          if (t && t.family) {
            st.sso.get(t.family).alive = false;
            for (const x of st.tokens.values()) if (x.family === t.family) x.dead = true;
            sso_ended = true;
          }
          if (t) t.dead = true;
          return send(res, 200, { ok: true, sso_ended });
        }
        case 'GET /api/sm/me': { if (!authed()) return; return send(res, 200, { user, sync_enabled: true, kdf: KDF }); }
        case 'GET /api/sm/library': { if (!authed()) return; return send(res, 200, st.library); }
        case 'PUT /api/sm/library': {
          if (!authed()) return;
          st.library = { version: (st.library.version || 0) + 1, blob: body.blob };
          return send(res, 200, { version: st.library.version });
        }
        case 'GET /api/sm/releases/latest': { if (!authed()) return; return send(res, 200, { version: '0.0.1' }); }
        default: return err(res, 404, 'not_found');
      }
    });
  });
  return { server, st };
}

// --- Ortam ---------------------------------------------------------------------
let srv; let account; let deriveKeys; let decryptLibrary;

test.before(async () => {
  // API_BASE modül yüklenirken okunur: önce sunucu, sonra modül
  const probe = http.createServer(); await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address(); await new Promise((r) => probe.close(r));
  process.env.SSHM_API = `http://127.0.0.1:${port}`;
  account = require('../src/account');
  ({ deriveKeys, decryptLibrary } = account);
  const { authHash } = await deriveKeys(PASSWORD, KDF);
  srv = createServer(authHash);
  await new Promise((r) => srv.server.listen(port, '127.0.0.1', r));
});
test.after(() => new Promise((r) => srv.server.close(r)));
test.beforeEach(() => {
  srv.st.sso.clear(); srv.st.tokens.clear(); srv.st.appDisabled = false;
  srv.st.library = { version: null, blob: null }; srv.st.calls.length = 0;
});

// Aynı bilgisayardaki iki uygulama için ortak kimlik deposu + durum klasörü
function machine() { return { keyring: memoryKeyring(), stateDir: tmpDir('sshm-sso-') }; }

function app(m, { store } = {}) {
  const events = { expired: [], signedIn: [], status: [] };
  const st = store || { connections: [], folders: [], shortcuts: [], syncMeta: {} };
  const acct = account.createAccount({
    sso: createSso({ keyring: m.keyring, stateDir: m.stateDir, pollMs: 40 }),
    userDataDir: tmpDir('sshm-ud-'), appVersion: '9.9.9',
    encrypt: (s) => `x:${s}`, decrypt: (s) => String(s).replace(/^x:/, ''),
    getStore: () => st,
    replaceLibrary: (lib) => Object.assign(st, lib),
    persistStore: () => {}, backupAndClearLibrary: () => null,
    onStatus: (s) => events.status.push(s.state),
    onSessionExpired: (code) => events.expired.push(code),
    onSignedIn: (r) => events.signedIn.push(r),
    onUpdate: () => {},
  });
  return { acct, events, store: st };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const credOf = (m) => JSON.parse(m.keyring.peek());

// --- Testler -------------------------------------------------------------------
test('şifreyle giriş sso:true gönderir ve ortak kimliği sözleşme biçiminde yazar', async () => {
  const m = machine();
  const a = app(m);
  await a.acct.login(EMAIL, PASSWORD, true);
  const login = srv.st.calls.find((c) => c.route === 'POST /api/sm/auth/login');
  assert.equal(login.body.sso, true);
  const cred = credOf(m);
  assert.equal(cred.v, 1);
  assert.equal(cred.email, EMAIL);
  assert.match(cred.sso_token, /^sso-/);
  assert.equal(Buffer.from(cred.master, 'base64').length, 32);
  assert.deepEqual(cred.kdf, KDF);
  assert.equal(createSso(m).readState().state, 'in');
});

test('ikinci uygulama şifresiz girer ve aynı senkron anahtarıyla kütüphaneyi çözer', async () => {
  const m = machine();
  const a = app(m, { store: { connections: [{ id: 'c1', name: 'Web', host: 'web.example.com', port: 22, username: 'deploy', authType: 'password', password: 'x:gizli' }], folders: [], shortcuts: [], syncMeta: {} } });
  await a.acct.login(EMAIL, PASSWORD, true);
  await a.acct.syncNow();
  assert.ok(srv.st.library.blob, 'A kütüphaneyi yükledi');

  const b = app(m);
  const r = await b.acct.resume();
  assert.equal(r.ok, true);
  assert.equal(b.acct.isLoggedIn(), true);
  const sso = srv.st.calls.find((c) => c.route === 'POST /api/sm/auth/sso');
  assert.equal(sso.body.sso_token, credOf(m).sso_token);
  await b.acct.syncNow();
  const conn = b.store.connections.find((c) => c.id === 'c1');
  assert.ok(conn, 'B, A’nın bağlantısını çözdü');
  assert.equal(conn.host, 'web.example.com');
  // Sunucuya şifre de master da gitmez
  for (const c of srv.st.calls) {
    const s = JSON.stringify(c.body);
    assert.ok(!s.includes(PASSWORD));
    assert.ok(!s.includes(credOf(m).master));
  }
  a.acct.stopWatching(); b.acct.stopWatching();
});

test('bir uygulamada çıkış: ortak kimlik silinir, durum "out", diğeri giriş ekranına döner', async () => {
  const m = machine();
  const a = app(m); const b = app(m);
  await a.acct.login(EMAIL, PASSWORD, true);
  await b.acct.resume();
  a.acct.startWatching(); b.acct.startWatching();

  await b.acct.logout();
  assert.equal(m.keyring.peek(), null);
  assert.equal(createSso(m).readState().state, 'out');
  assert.ok(srv.st.calls.some((c) => c.route === 'POST /api/sm/auth/logout'));
  await sleep(250);
  assert.equal(a.acct.isLoggedIn(), false);
  assert.deepEqual(a.events.expired, ['signed_out']);
  assert.deepEqual(b.events.expired, [], 'çıkış yapan uygulama kendi değişikliğini ikinci kez işlemez');
  a.acct.stopWatching(); b.acct.stopWatching();
});

test('giriş ekranındaki uygulama, başka uygulamada giriş yapılınca şifresiz açılır', async () => {
  const m = machine();
  const waiting = app(m);
  waiting.acct.startWatching();
  const other = app(m);
  await other.acct.login(EMAIL, PASSWORD, true);
  await sleep(250);
  assert.equal(waiting.acct.isLoggedIn(), true);
  assert.equal(waiting.events.signedIn.length, 1);
  waiting.acct.stopWatching();
});

test('ortak oturum sunucuda düşmüşse (401) kimlik silinir, durum "out"', async () => {
  const m = machine();
  const a = app(m);
  await a.acct.login(EMAIL, PASSWORD, true);
  for (const s of srv.st.sso.values()) s.alive = false; // ör. Hesabım › Oturumlar'dan kapatıldı
  const b = app(m);
  const r = await b.acct.resume();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'session_expired');
  assert.equal(m.keyring.peek(), null);
  assert.equal(createSso(m).readState().state, 'out');
});

test('403 app_disabled: SSH Master açılmaz ama ortak oturum diğer uygulamalar için kalır', async () => {
  const m = machine();
  const a = app(m);
  await a.acct.login(EMAIL, PASSWORD, true);
  srv.st.appDisabled = true;
  const b = app(m);
  const r = await b.acct.resume();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'app_disabled');
  assert.ok(m.keyring.peek(), 'ortak kimlik silinmedi');
});

test('istek sırasında 401: oturum kapanır, ortak kimlik silinir', async () => {
  const m = machine();
  const a = app(m);
  await a.acct.login(EMAIL, PASSWORD, true);
  for (const t of srv.st.tokens.values()) t.dead = true;
  await a.acct.start();
  assert.equal(a.acct.isLoggedIn(), false);
  assert.deepEqual(a.events.expired, ['session_expired']);
  assert.equal(m.keyring.peek(), null);
});

test('uygulama kapalıyken başka yerde çıkış yapıldıysa açılışta saklı oturum kapanır', async () => {
  const m = machine();
  const ud = tmpDir('sshm-ud-');
  const mk = () => account.createAccount({
    sso: createSso({ keyring: m.keyring, stateDir: m.stateDir }), userDataDir: ud, appVersion: '9.9.9',
    encrypt: (s) => s, decrypt: (s) => s, getStore: () => ({ connections: [], folders: [], shortcuts: [], syncMeta: {} }),
    replaceLibrary: () => {}, persistStore: () => {}, backupAndClearLibrary: () => null,
    onStatus: () => {}, onSessionExpired: () => {}, onUpdate: () => {},
  });
  await mk().login(EMAIL, PASSWORD, true);
  m.keyring.del(); // başka bir uygulamada çıkış
  const again = mk(); // yeniden açılış: "Beni hatırla" ile saklı oturum var
  assert.equal(again.isLoggedIn(), true);
  const r = await again.resume();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'signed_out');
  assert.equal(again.isLoggedIn(), false);
});

test('kimlik deposu yoksa (sso: null) giriş eskisi gibi çalışır, sso:false gönderilir', async () => {
  const acct = account.createAccount({
    userDataDir: tmpDir('sshm-ud-'), appVersion: '9.9.9', encrypt: (s) => s, decrypt: (s) => s,
    getStore: () => ({ connections: [], folders: [], shortcuts: [], syncMeta: {} }),
    replaceLibrary: () => {}, persistStore: () => {}, backupAndClearLibrary: () => null,
    onStatus: () => {}, onSessionExpired: () => {}, onUpdate: () => {},
  });
  await acct.login(EMAIL, PASSWORD, true);
  assert.equal(acct.isLoggedIn(), true);
  assert.equal(srv.st.calls.find((c) => c.route === 'POST /api/sm/auth/login').body.sso, false);
  assert.deepEqual(await acct.resume(), { ok: true });
});

test('yanlış şifre: ortak kimlik yazılmaz', async () => {
  const m = machine();
  const a = app(m);
  await assert.rejects(a.acct.login(EMAIL, 'yanlis', true), (e) => e.code === 'bad_credentials');
  assert.equal(m.keyring.peek(), null);
});
