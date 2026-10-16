'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createSso, encodeCredential, decodeCredential, MAX_CHARS } = require('../src/sso');
const { memoryKeyring, tmpDir } = require('./helpers');

const sample = () => ({
  email: 'ornek@example.com', user: { id: 42, name: 'Örnek Kullanıcı' }, sso_token: 'tok-abc',
  master: Buffer.alloc(32, 7), kdf: { alg: 'PBKDF2-SHA256', iter: 600000, salt: 'c2FsdHNhbHRzYWx0c2FsdA==' },
});

test('ortak kimlik sözleşmedeki biçimde yazılır ve okunur', () => {
  const kr = memoryKeyring();
  const sso = createSso({ keyring: kr, stateDir: tmpDir(), now: () => 1000 });
  sso.writeCredential(sample());
  const raw = JSON.parse(kr.peek());
  assert.deepEqual(Object.keys(raw), ['v', 'email', 'user', 'sso_token', 'master', 'kdf', 'at']);
  assert.equal(raw.v, 1);
  assert.equal(raw.master, Buffer.alloc(32, 7).toString('base64'));
  assert.deepEqual(raw.user, { id: 42, name: 'Örnek Kullanıcı' });
  assert.equal(raw.at, 1000);
  const c = sso.readCredential();
  assert.equal(c.sso_token, 'tok-abc');
  assert.equal(Buffer.from(c.master, 'base64').length, 32);
});

test('bozuk ya da başka sürüm kimlik yok sayılır', () => {
  assert.equal(decodeCredential('{bozuk'), null);
  assert.equal(decodeCredential(JSON.stringify({ v: 2, sso_token: 'x' })), null);
  assert.equal(decodeCredential(JSON.stringify({ v: 1 })), null);
  assert.equal(decodeCredential(null), null);
});

test('çok uzun ad kısaltılır; kimlik Windows sınırını (1280 karakter) aşmaz', () => {
  const json = encodeCredential({ ...sample(), user: { id: 1, name: 'x'.repeat(5000) } });
  assert.ok(json.length <= MAX_CHARS);
  assert.ok(Buffer.byteLength(json, 'utf16le') <= 2560);
  assert.equal(decodeCredential(json).sso_token, 'tok-abc');
});

test('silme sonrası kimlik okunmaz', () => {
  const sso = createSso({ keyring: memoryKeyring(), stateDir: tmpDir() });
  sso.writeCredential(sample());
  sso.deleteCredential();
  assert.equal(sso.readCredential(), null);
  sso.deleteCredential(); // yokken de hata vermez
});

test('durum dosyası gen artırarak yazılır, gizli bilgi içermez', () => {
  const dir = tmpDir();
  const sso = createSso({ keyring: memoryKeyring(), stateDir: dir, now: () => 5 });
  assert.deepEqual(sso.readState(), { gen: 0, state: 'out', at: 0 });
  assert.deepEqual(sso.bumpState('in'), { gen: 1, state: 'in', at: 5 });
  assert.deepEqual(sso.bumpState('out'), { gen: 2, state: 'out', at: 5 });
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'sso-state.json'), 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['at', 'gen', 'state']);
  assert.deepEqual(fs.readdirSync(dir), ['sso-state.json']); // geçici dosya kalmaz
});

test('başka uygulamanın durum değişikliği izleyiciye bildirilir, kendi yazdığımız "seen" ile atlanır', async () => {
  const dir = tmpDir();
  const kr = memoryKeyring();
  const a = createSso({ keyring: kr, stateDir: dir, pollMs: 50 });
  const b = createSso({ keyring: kr, stateDir: dir, pollMs: 50 });
  const seen = [];
  const w = a.watch((s) => seen.push(s.state));
  const mine = a.bumpState('in');
  w.seen(mine.gen);
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(seen, []);
  b.bumpState('out'); // diğer uygulama
  await new Promise((r) => setTimeout(r, 200));
  w.stop();
  assert.deepEqual(seen, ['out']);
});
