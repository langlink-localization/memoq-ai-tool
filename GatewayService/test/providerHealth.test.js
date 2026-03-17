const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDirectProviderProbeUrl,
  checkMtProviderHealth,
  createActiveProviderProbe,
  summarizeProviderHealth,
} = require('../src/providerHealth');

test('checkMtProviderHealth marks mock providers healthy without credentials', async () => {
  const status = await checkMtProviderHealth({
    id: 'mock-llm',
    type: 'mock',
    enabled: true,
  }, {
    apiKey: '',
    litellmStatus: { enabled: false, running: false },
  });

  assert.equal(status.healthy, true);
  assert.equal(status.code, 'OK');
});

test('checkMtProviderHealth reports missing api key for enabled OpenAI-compatible providers', async () => {
  const status = await checkMtProviderHealth({
    id: 'provider-a',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
    enabled: true,
  }, {
    apiKey: '',
    litellmStatus: { enabled: false, running: false },
  });

  assert.equal(status.healthy, false);
  assert.equal(status.code, 'API_KEY_MISSING');
});

test('checkMtProviderHealth reports LiteLLM as required when provider is routed through LiteLLM', async () => {
  const status = await checkMtProviderHealth({
    id: 'provider-b',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
    enabled: true,
  }, {
    apiKey: 'secret',
    litellmStatus: { enabled: true, running: false },
    runtimeConfig: { litellm: { enabled: true } },
  });

  assert.equal(status.healthy, false);
  assert.equal(status.code, 'LITELLM_UNAVAILABLE');
});

test('checkMtProviderHealth runs an active probe when provided', async () => {
  let probeCalled = false;
  const status = await checkMtProviderHealth({
    id: 'provider-c',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
    enabled: true,
  }, {
    apiKey: 'secret',
    litellmStatus: { enabled: false, running: false },
    probe: async (provider) => {
      probeCalled = true;
      assert.equal(provider.id, 'provider-c');
      return { ok: false, code: 'AUTH_FAILED', message: 'upstream rejected credentials' };
    },
  });

  assert.equal(probeCalled, true);
  assert.equal(status.healthy, false);
  assert.equal(status.code, 'AUTH_FAILED');
});

test('buildDirectProviderProbeUrl normalizes OpenAI-compatible endpoints to /models', () => {
  assert.equal(
    buildDirectProviderProbeUrl('https://example.test/v1/chat/completions'),
    'https://example.test/v1/models'
  );
  assert.equal(
    buildDirectProviderProbeUrl('https://example.test/custom'),
    'https://example.test/custom/models'
  );
});

test('createActiveProviderProbe probes direct provider model endpoint with bearer auth', async () => {
  const calls = [];
  const probe = createActiveProviderProbe({
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return '{"data":[{"id":"gpt-5-mini"}]}';
        },
      };
    },
  });

  const result = await probe({
    id: 'provider-d',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
  }, {
    apiKey: 'secret',
    runtimeConfig: { litellm: { enabled: false } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.target, 'https://example.test/v1/models');
  assert.ok(result.durationMs >= 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/v1/models');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].options.method, 'GET');
});

test('createActiveProviderProbe checks LiteLLM model exposure when desktop routing is enabled', async () => {
  const probe = createActiveProviderProbe({
    fetch: async (url) => {
      assert.equal(url, 'http://127.0.0.1:4000/v1/models');
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            data: [
              { id: 'provider-e' },
            ],
          });
        },
      };
    },
  });

  const result = await probe({
    id: 'provider-e',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
  }, {
    apiKey: 'secret',
    runtimeConfig: {
      litellm: {
        enabled: true,
        host: '127.0.0.1',
        port: 4000,
      },
    },
  });

  assert.equal(result.ok, true);
});

test('createActiveProviderProbe reports auth failures with a dedicated code', async () => {
  const probe = createActiveProviderProbe({
    fetch: async () => ({
      ok: false,
      status: 401,
      async text() {
        return 'unauthorized';
      },
    }),
  });

  const result = await probe({
    id: 'provider-f',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
  }, {
    apiKey: 'bad-secret',
    runtimeConfig: { litellm: { enabled: false } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_FAILED');
  assert.equal(result.target, 'https://example.test/v1/models');
});

test('createActiveProviderProbe reports missing direct provider model exposure with a dedicated code', async () => {
  const probe = createActiveProviderProbe({
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: [
            { id: 'other-model' },
          ],
        });
      },
    }),
  });

  const result = await probe({
    id: 'provider-g',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
    model: 'missing-model',
  }, {
    apiKey: 'secret',
    runtimeConfig: { litellm: { enabled: false } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MODEL_NOT_EXPOSED');
  assert.equal(result.target, 'https://example.test/v1/models');
});

test('createActiveProviderProbe reports missing LiteLLM model exposure with a dedicated code', async () => {
  const probe = createActiveProviderProbe({
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: [
            { id: 'other-provider' },
          ],
        });
      },
    }),
  });

  const result = await probe({
    id: 'provider-g',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
  }, {
    apiKey: 'secret',
    runtimeConfig: {
      litellm: {
        enabled: true,
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MODEL_NOT_EXPOSED');
  assert.equal(result.target, 'http://127.0.0.1:4000/v1/models');
});

test('createActiveProviderProbe falls back to chat probe when models endpoint is unavailable', async () => {
  const calls = [];
  const probe = createActiveProviderProbe({
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://example.test/v1/models') {
        return {
          ok: false,
          status: 404,
          async text() {
            return 'missing';
          },
        };
      }

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [
              { message: { content: 'pong' } },
            ],
          });
        },
      };
    },
  });

  const result = await probe({
    id: 'provider-h',
    type: 'openai-compatible',
    endpoint: 'https://example.test/v1',
    model: 'gpt-5-mini',
  }, {
    apiKey: 'secret',
    runtimeConfig: { litellm: { enabled: false } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.target, 'https://example.test/v1/chat/completions');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer secret');
});

test('summarizeProviderHealth counts enabled providers and unhealthy entries', () => {
  const summary = summarizeProviderHealth([
    { enabled: true, healthy: true },
    { enabled: true, healthy: false },
    { enabled: false, healthy: false },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.enabled, 2);
  assert.equal(summary.healthy, 1);
  assert.equal(summary.unhealthy, 1);
});
