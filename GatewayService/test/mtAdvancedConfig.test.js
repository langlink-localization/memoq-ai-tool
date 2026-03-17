const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeConfig, sanitizeConfigForClient } = require('../src/config');

test('mergeConfig adds default MT advanced settings for desktop orchestration', () => {
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
        defaultProviderId: 'openai-gpt-5-mini',
        providers: [
          { id: 'openai-gpt-5-mini', enabled: true, model: 'gpt-5-mini', type: 'openai' },
        ],
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {});

  assert.equal(merged.interfaces.mt.advanced.batching.maxSegmentsPerBatch, 8);
  assert.equal(merged.interfaces.mt.advanced.retry.maxAttempts, 2);
  assert.equal(merged.interfaces.mt.advanced.glossary.enabled, false);
  assert.equal(merged.interfaces.mt.advanced.prompts.templates.length > 0, true);
  assert.equal(merged.interfaces.mt.advanced.runtime.maxConcurrency, 1);
});

test('sanitizeConfigForClient exposes advanced MT settings to desktop UI', () => {
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
        defaultProviderId: 'openai-gpt-5-mini',
        providers: [
          { id: 'openai-gpt-5-mini', enabled: true, model: 'gpt-5-mini', type: 'openai' },
        ],
        advanced: {
          glossary: {
            enabled: true,
            entriesText: 'CPU,中央处理器',
          },
        },
      },
      tm: { enabled: true },
      tb: { enabled: true },
      qa: { enabled: true },
    },
  }, {}));

  assert.equal(sanitized.interfaces.mt.advanced.glossary.enabled, true);
  assert.match(sanitized.interfaces.mt.advanced.glossary.entriesText, /CPU/);
  assert.equal(sanitized.interfaces.mt.advanced.prompts.templates.length > 0, true);
});
