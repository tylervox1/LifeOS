
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_SECRET='01234567890123456789012345678901';
const { encrypt, decrypt, hashToken } = await import('../../server/crypto.js');

test('encrypt/decrypt round trip', () => {
  const cipher = encrypt('secret-value');
  assert.notEqual(cipher, 'secret-value');
  assert.equal(decrypt(cipher), 'secret-value');
});

test('hashToken is deterministic and one-way shaped', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), 'abc');
  assert.equal(hashToken('abc').length, 64);
});
