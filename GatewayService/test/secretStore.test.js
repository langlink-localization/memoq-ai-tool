const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('secret store keeps provider api keys outside the main config payload and supports legacy migration', () => {
  const originalAppData = process.env.APPDATA;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-secret-store-'));
  process.env.APPDATA = tempDir;

  try {
    delete require.cache[require.resolve('../src/secretStore')];
    const {
      getProviderSecret,
      migrateLegacyProviderSecrets,
      setProviderSecret,
    } = require('../src/secretStore');

    const secretInfo = setProviderSecret('provider-a', 'test-key');
    assert.ok(secretInfo.secretRef);

    const directProvider = {
      id: 'provider-a',
      secretRef: secretInfo.secretRef,
    };
    assert.equal(getProviderSecret(directProvider), 'test-key');

    const config = {
      interfaces: {
        mt: {
          providers: [
            {
              id: 'legacy-provider',
              encryptedApiKey: require('../src/security').protect('legacy-key'),
              apiKeyProvidedAt: '2026-03-17T00:00:00.000Z',
            },
          ],
        },
      },
    };

    const migration = migrateLegacyProviderSecrets(config);
    assert.equal(migration.changed, true);
    assert.ok(config.interfaces.mt.providers[0].secretRef);
    assert.equal(getProviderSecret(config.interfaces.mt.providers[0]), 'legacy-key');
  } finally {
    process.env.APPDATA = originalAppData;
    delete require.cache[require.resolve('../src/secretStore')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
