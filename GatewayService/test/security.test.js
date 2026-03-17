const test = require('node:test');
const assert = require('node:assert/strict');

const { protect, unprotect } = require('../src/security');

test('unprotect returns an empty string for malformed ciphertext', () => {
  assert.equal(unprotect('zz:not-hex:still-not-hex'), '');
});

test('unprotect returns an empty string when ciphertext cannot be authenticated', () => {
  const encrypted = protect('secret-value');
  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  const corrupted = `${ivHex}:${tagHex}:${dataHex.slice(0, -2)}ff`;

  assert.equal(unprotect(corrupted), '');
});
