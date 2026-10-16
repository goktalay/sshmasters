'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Bellek içi kimlik deposu (@napi-rs/keyring Entry ile aynı arayüz)
function memoryKeyring() {
  let value = null;
  return { get: () => value, set: (v) => { value = String(v); }, del: () => { value = null; }, peek: () => value };
}

// Aynı depoyu ve klasörü paylaşan iki "uygulama" için ortak ortam
function tmpDir(prefix = 'mt-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

module.exports = { memoryKeyring, tmpDir };
