const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { mergeAdminConfig, mergeConfig, sanitizeConfigForClient } = require('../src/config');

test('mergeConfig keeps a valid default MT provider when requested default is missing', () => {
  const base = {
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'mock-llm',
        providers: [
          { id: 'mock-llm', enabled: true, model: 'mock-model', type: 'mock' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  };

  const merged = mergeConfig(base, {
    interfaces: {
      mt: {
        defaultProviderId: 'missing-provider',
        providers: [
          { id: 'provider-a', enabled: true, model: 'a-model', type: 'openai-compatible' },
          { id: 'provider-b', enabled: true, model: 'b-model', type: 'openai-compatible' },
        ],
      },
    },
  });

  assert.equal(merged.interfaces.mt.defaultProviderId, 'openai-gpt-5-mini');
});

test('mergeConfig keeps at least one MT provider when UI sends an empty list', () => {
  const base = {
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'mock-llm',
        providers: [
          { id: 'mock-llm', enabled: true, model: 'mock-model', type: 'mock' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  };

  const merged = mergeConfig(base, {
    interfaces: {
      mt: {
        providers: [],
      },
    },
  });

  assert.ok(merged.interfaces.mt.providers.some((provider) => provider.id === 'mock-llm'));
  assert.ok(merged.interfaces.mt.providers.some((provider) => provider.id === 'openai-gpt-5-mini'));
  assert.equal(merged.interfaces.mt.defaultProviderId, 'openai-gpt-5-mini');
});

test('mergeConfig normalizes provider fields from partial UI payloads', () => {
  const base = {
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'mock-llm',
        providers: [
          { id: 'mock-llm', enabled: true, model: 'mock-model', type: 'mock' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  };

  const merged = mergeConfig(base, {
    interfaces: {
      mt: {
        defaultProviderId: 'custom-provider',
        providers: [
          { id: 'custom-provider', name: 'Custom Provider', type: '', model: 'gpt-4.1-mini', endpoint: ' https://example.test/v1 ' },
        ],
      },
    },
  });

  const provider = merged.interfaces.mt.providers[0];
  assert.equal(provider.id, 'custom-provider');
  assert.equal(provider.name, 'Custom Provider');
  assert.equal(provider.type, 'openai-compatible');
  assert.equal(provider.model, 'gpt-4.1-mini');
  assert.equal(provider.endpoint, 'https://example.test/v1');
  assert.equal(provider.enabled, true);
});

test('mergeConfig upgrades legacy mock default to the OpenAI GPT-5 mini preset', () => {
  const merged = mergeConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'mock-llm',
        providers: [
          { id: 'mock-llm', enabled: true, model: 'memoq-mock-model', type: 'mock', name: 'Mock LLM' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {});

  assert.equal(merged.interfaces.mt.defaultProviderId, 'openai-gpt-5-mini');
});

test('mergeConfig preserves an explicitly selected non-default provider', () => {
  const merged = mergeConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'custom-provider',
        providers: [
          { id: 'custom-provider', enabled: true, model: 'gpt-4.1-mini', type: 'openai-compatible', name: 'Custom Provider' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {});

  assert.equal(merged.interfaces.mt.defaultProviderId, 'custom-provider');
});

test('sanitizeConfigForClient exposes the default OpenAI GPT-5 mini preset', () => {
  const sanitized = sanitizeConfigForClient(mergeConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'mock-llm',
        providers: [
          { id: 'mock-llm', enabled: true, model: 'memoq-mock-model', type: 'mock', name: 'Mock LLM' },
          {
            id: 'openai-gpt-5-mini',
            enabled: true,
            model: 'gpt-5-mini',
            type: 'openai',
            name: 'OpenAI GPT-5 mini',
            endpoint: 'https://api.openai.com/v1',
          },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {}));

  const provider = sanitized.interfaces.mt.providers.find((item) => item.id === 'openai-gpt-5-mini');
  assert.ok(provider);
  assert.equal(provider.name, 'OpenAI GPT-5 mini');
  assert.equal(provider.type, 'openai');
  assert.equal(provider.model, 'gpt-5-mini');
  assert.equal(provider.endpoint, 'https://api.openai.com/v1');
});

test('mergeConfig appends the built-in OpenAI GPT-5 mini preset for older saved configs', () => {
  const merged = mergeConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'mock-llm',
        providers: [
          { id: 'mock-llm', enabled: true, model: 'memoq-mock-model', type: 'mock', name: 'Mock LLM' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {});

  const provider = merged.interfaces.mt.providers.find((item) => item.id === 'openai-gpt-5-mini');
  assert.ok(provider);
  assert.equal(provider.type, 'openai');
  assert.equal(provider.model, 'gpt-5-mini');
  assert.equal(provider.endpoint, 'https://api.openai.com/v1');
});

test('mergeAdminConfig preserves stored provider secrets when UI omits API key fields', () => {
  const merged = mergeAdminConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'custom-provider',
        providers: [
          {
            id: 'custom-provider',
            enabled: true,
            model: 'gpt-4.1-mini',
            type: 'openai-compatible',
            name: 'Custom Provider',
            endpoint: 'https://example.test/v1',
            secretRef: 'provider:custom-provider:apiKey',
            apiKeyProvidedAt: '2026-03-16T12:00:00.000Z',
          },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {
    interfaces: {
      mt: {
        providers: [
          {
            id: 'custom-provider',
            enabled: true,
            model: 'gpt-4.1-mini',
            type: 'openai-compatible',
            name: 'Custom Provider',
            endpoint: 'https://example.test/v2',
          },
        ],
      },
    },
  });

  const provider = merged.interfaces.mt.providers.find((item) => item.id === 'custom-provider');
  assert.ok(provider);
  assert.equal(provider.endpoint, 'https://example.test/v2');
  assert.equal(provider.secretRef, 'provider:custom-provider:apiKey');
  assert.equal(provider.apiKeyProvidedAt, '2026-03-16T12:00:00.000Z');
});

test('mergeAdminConfig re-normalizes invalid MT admin payloads before persisting', () => {
  const merged = mergeAdminConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'custom-provider',
        providers: [
          { id: 'custom-provider', enabled: true, model: 'gpt-4.1-mini', type: 'openai-compatible', name: 'Custom Provider' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {
    interfaces: {
      mt: {
        defaultProviderId: 'missing-provider',
        providers: [],
      },
    },
  });

  assert.ok(merged.interfaces.mt.providers.some((provider) => provider.id === 'mock-llm'));
  assert.ok(merged.interfaces.mt.providers.some((provider) => provider.id === 'openai-gpt-5-mini'));
  assert.equal(merged.interfaces.mt.defaultProviderId, 'openai-gpt-5-mini');
});

test('loadConfig falls back to defaults when config.json is malformed', () => {
  const originalAppData = process.env.APPDATA;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-config-test-'));
  process.env.APPDATA = tempDir;

  try {
    const runtimeDir = path.join(tempDir, 'memoq-ai-gateway');
    fs.mkdirSync(runtimeDir, { recursive: true });
    const configPath = path.join(runtimeDir, 'config.json');
    fs.writeFileSync(configPath, '{"interfaces":', 'utf8');

    delete require.cache[require.resolve('../src/config')];
    const { loadConfig } = require('../src/config');
    const loaded = loadConfig();

    assert.equal(loaded.port, 5271);
    assert.equal(loaded.interfaces.mt.defaultProviderId, 'openai-gpt-5-mini');
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } finally {
    process.env.APPDATA = originalAppData;
    delete require.cache[require.resolve('../src/config')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('sanitizeConfigForClient exposes memoQ integration defaults and custom path overrides', () => {
  const sanitized = sanitizeConfigForClient(mergeConfig({
    port: 5271,
    host: '127.0.0.1',
    log: {},
    security: {},
    integration: {
      memoqVersion: '11',
      customInstallDir: '',
    },
    litellm: {},
    interfaces: {
      mt: {
        enabled: true,
        requestTimeoutMs: 120000,
        maxBatchSegments: 8,
        defaultProviderId: 'openai-gpt-5-mini',
        providers: [],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {
    integration: {
      memoqVersion: '12',
      customInstallDir: 'D:\\Apps\\memoQ\\memoQ-12',
    },
  }));

  assert.equal(sanitized.integration.memoqVersion, '12');
  assert.equal(sanitized.integration.customInstallDir, 'D:\\Apps\\memoQ\\memoQ-12');
  assert.deepEqual(sanitized.integration.supportedVersions, ['10', '11', '12']);
});

test('loadConfig enables LiteLLM by default for managed routing', () => {
  const originalAppData = process.env.APPDATA;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-config-litellm-'));
  process.env.APPDATA = tempDir;

  try {
    delete require.cache[require.resolve('../src/config')];
    const { loadConfig } = require('../src/config');
    const loaded = loadConfig();
    assert.equal(loaded.litellm.enabled, true);
  } finally {
    process.env.APPDATA = originalAppData;
    delete require.cache[require.resolve('../src/config')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
