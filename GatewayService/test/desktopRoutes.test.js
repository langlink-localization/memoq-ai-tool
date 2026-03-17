const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

test('createGatewayServer registers desktop integration routes and version payload', async () => {
  const originalAppData = process.env.APPDATA;
  const originalLoad = Module._load;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-gateway-routes-'));
  process.env.APPDATA = tempDir;

  const routeTable = { get: new Map(), post: new Map() };

  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'express') {
        const express = () => ({
          use() {},
          get(route, handler) {
            routeTable.get.set(route, handler);
          },
          post(route, ...handlers) {
            routeTable.post.set(route, handlers[handlers.length - 1]);
          },
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
            async translateWithMock() {
              return ['ok'];
            },
            async translateWithProvider() {
              return ['ok'];
            },
            tmLookup() { return []; },
            tbLookup() { return []; },
            qaCheck() { return []; },
          };
        }
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../src/server')];
    const { createGatewayServer } = require('../src/server');
    const gateway = await createGatewayServer();

    try {
      assert.ok(routeTable.get.has('/desktop/version'));
      assert.ok(routeTable.get.has('/desktop/integration/status'));
      assert.ok(routeTable.post.has('/desktop/integration/install'));
      assert.ok(routeTable.post.has('/desktop/integration/repair'));

      const response = {
        payload: null,
        json(body) {
          this.payload = body;
        },
      };

      routeTable.get.get('/desktop/version')({}, response);

      assert.equal(response.payload.productName, 'memoQ AI Gateway');
      assert.equal(response.payload.contractVersion, '1');
      assert.ok(response.payload.desktopVersion);
      assert.equal(response.payload.mt.maxBatchSegments, 8);
      assert.equal(response.payload.mt.capabilities.requestTypePolicy, true);
      assert.equal(response.payload.mt.capabilities.batching, true);
      assert.equal(response.payload.mt.capabilities.promptTemplates, true);
    } finally {
      gateway.cleanup();
    }
  } finally {
    Module._load = originalLoad;
    process.env.APPDATA = originalAppData;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('mt route rejects requests with mismatched contract versions', async () => {
  const originalAppData = process.env.APPDATA;
  const originalLoad = Module._load;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-gateway-contract-'));
  process.env.APPDATA = tempDir;

  const routeTable = { post: new Map() };
  let translateCalled = false;

  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'express') {
        const express = () => ({
          use() {},
          get() {},
          post(route, ...handlers) {
            routeTable.post.set(route, handlers);
          },
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
            async translateWithMock() {
              translateCalled = true;
              return ['ok'];
            },
            async translateWithProvider() {
              translateCalled = true;
              return ['ok'];
            },
            tmLookup() { return []; },
            tbLookup() { return []; },
            qaCheck() { return []; },
          };
        }
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../src/server')];
    const { createGatewayServer } = require('../src/server');
    const gateway = await createGatewayServer();

    try {
      const handlers = routeTable.post.get('/mt/translate');
      assert.ok(Array.isArray(handlers));
      assert.ok(handlers.length >= 2);

      const req = {
        body: {
          requestId: 'req-1',
          traceId: 'trace-1',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          requestType: 'Plaintext',
          providerId: 'GatewayDesktop_LLM',
          contractVersion: '999',
          segments: [{ index: 0, text: 'hello', plainText: 'hello' }],
        },
      };

      const res = {
        statusCode: 200,
        payload: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.payload = body;
          return this;
        },
      };

      await handlers[0](req, res, () => {});
      await handlers[1](req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.payload.error.code, 'CONTRACT_VERSION_MISMATCH');
      assert.equal(translateCalled, false);
    } finally {
      gateway.cleanup();
    }
  } finally {
    Module._load = originalLoad;
    process.env.APPDATA = originalAppData;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('mt route returns a timeout error when provider execution exceeds desktop timeout', async () => {
  const originalAppData = process.env.APPDATA;
  const originalLoad = Module._load;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-gateway-timeout-'));
  process.env.APPDATA = tempDir;

  const routeTable = { post: new Map() };

  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'express') {
        const express = () => ({
          use() {},
          get() {},
          post(route, ...handlers) {
            routeTable.post.set(route, handlers);
          },
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
              getStatus: () => ({ enabled: false, running: false }),
              stop() {},
            }),
          };
        }
        if (request === './translationService') {
          return {
            async translateWithMock() {
              return ['ok'];
            },
            translateWithProvider(batchPayload) {
              return new Promise((resolve, reject) => {
                batchPayload.abortSignal?.addEventListener('abort', () => {
                  reject(new Error('aborted'));
                }, { once: true });
              });
            },
            tmLookup() { return []; },
            tbLookup() { return []; },
            qaCheck() { return []; },
          };
        }
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../src/server')];
    const { createGatewayServer } = require('../src/server');
    const gateway = await createGatewayServer();
    gateway.setConfig({
      interfaces: {
        mt: {
          requestTimeoutMs: 5,
        },
      },
    });

    try {
      const handlers = routeTable.post.get('/mt/translate');
      assert.ok(Array.isArray(handlers));
      assert.ok(handlers.length >= 2);

      const req = {
        body: {
          requestId: 'req-timeout',
          traceId: 'trace-timeout',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          requestType: 'Plaintext',
          providerId: 'GatewayDesktop_LLM',
          contractVersion: '1',
          segments: [{ index: 0, text: 'hello', plainText: 'hello' }],
        },
      };

      const res = {
        statusCode: 200,
        payload: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.payload = body;
          return this;
        },
      };

      await handlers[0](req, res, () => {});
      await handlers[1](req, res);

      assert.equal(res.statusCode, 500);
      assert.equal(res.payload.error.code, 'TRANSLATION_TIMEOUT');
      assert.match(res.payload.error.message, /timed out/i);
    } finally {
      gateway.cleanup();
    }
  } finally {
    Module._load = originalLoad;
    process.env.APPDATA = originalAppData;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
