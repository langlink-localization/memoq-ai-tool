const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

const { pickProvider, resolveMtProviderSelection } = require('../src/providerSelection');

test('pickProvider prefers configured default provider when request uses desktop transport id', () => {
  const interfaceConfig = {
    defaultProviderId: 'real-provider',
    providers: [
      { id: 'mock-llm', enabled: true },
      { id: 'real-provider', enabled: true },
    ],
  };

  const provider = pickProvider(interfaceConfig, 'GatewayDesktop_LLM');

  assert.equal(provider.id, 'real-provider');
});

test('pickProvider falls back to first enabled provider when configured default is unavailable', () => {
  const interfaceConfig = {
    defaultProviderId: 'missing-provider',
    providers: [
      { id: 'mock-llm', enabled: false },
      { id: 'real-provider', enabled: true },
      { id: 'backup-provider', enabled: true },
    ],
  };

  const provider = pickProvider(interfaceConfig, 'GatewayDesktop_LLM');

  assert.equal(provider.id, 'real-provider');
});

test('pickProvider honors explicit desktop-side provider ids when they are enabled', () => {
  const interfaceConfig = {
    defaultProviderId: 'real-provider',
    providers: [
      { id: 'real-provider', enabled: true },
      { id: 'backup-provider', enabled: true },
    ],
  };

  const provider = pickProvider(interfaceConfig, 'backup-provider');

  assert.equal(provider.id, 'backup-provider');
});

test('resolveMtProviderSelection uses the desktop-configured model instead of payload model', () => {
  const interfaceConfig = {
    defaultProviderId: 'real-provider',
    providers: [
      { id: 'real-provider', enabled: true, model: 'desktop-model' },
    ],
  };

  const resolved = resolveMtProviderSelection(interfaceConfig, {
    providerId: 'GatewayDesktop_LLM',
    model: 'plugin-hidden-model',
  });

  assert.equal(resolved.providerId, 'real-provider');
  assert.equal(resolved.model, 'desktop-model');
});

test('createGatewayServer setConfig reuses admin config merge logic', async () => {
  const originalAppData = process.env.APPDATA;
  const originalLoad = Module._load;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-gateway-test-'));
  process.env.APPDATA = tempDir;

  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'express') {
        const express = () => ({
          use() {},
          get() {},
          post() {},
        });
        express.static = () => () => {};
        return express;
      }
      if (request === 'body-parser') {
        return {
          json: () => () => {},
          urlencoded: () => () => {},
        };
      }
      if (parent?.filename?.endsWith(path.join('src', 'server.js'))) {
        if (request === './db') {
          return {
            createDb: () => ({ db: {} }),
            initSchema() {},
            deleteExpiredLogs() {},
            insertLog() {},
            queryLogs: () => [],
          };
        }
        if (request === './litellmManager') {
          return {
            createLiteLLMManager: () => ({
              applyConfig() {},
              getStatus: () => ({ running: false }),
              stop() {},
            }),
          };
        }
        if (request === './translationService') {
          return {
            translateWithMock() {},
            translateWithProvider() {},
            tmLookup() {},
            tbLookup() {},
            qaCheck() {},
          };
        }
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../src/server')];
    const { createGatewayServer } = require('../src/server');
    const server = await createGatewayServer();

    try {
      const updated = server.setConfig({
        interfaces: {
          mt: {
            defaultProviderId: 'missing-provider',
            providers: [],
          },
        },
      });

      assert.equal(updated.interfaces.mt.defaultProviderId, 'openai-gpt-5-mini');
      assert.ok(updated.interfaces.mt.providers.some((provider) => provider.id === 'mock-llm'));
      assert.ok(updated.interfaces.mt.providers.some((provider) => provider.id === 'openai-gpt-5-mini'));
    } finally {
      server.cleanup();
    }
  } finally {
    Module._load = originalLoad;
    process.env.APPDATA = originalAppData;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
