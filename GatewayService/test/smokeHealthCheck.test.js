const test = require('node:test');
const assert = require('node:assert/strict');

const { waitForHealth } = require('../src/smokeHealthCheck');

test('waitForHealth retries until the health endpoint responds with 200', async () => {
  let attempts = 0;

  await waitForHealth({
    url: 'http://127.0.0.1:5271/health',
    attempts: 3,
    delayMs: 1,
    async fetchImpl(targetUrl) {
      attempts += 1;
      assert.equal(targetUrl, 'http://127.0.0.1:5271/health');

      if (attempts < 3) {
        throw new Error('connection refused');
      }

      return { status: 200 };
    },
    setTimeoutImpl(callback) {
      callback();
    },
  });

  assert.equal(attempts, 3);
});

test('waitForHealth throws the last failure when the endpoint never becomes ready', async () => {
  await assert.rejects(
    waitForHealth({
      url: 'http://127.0.0.1:5271/health',
      attempts: 2,
      delayMs: 1,
      async fetchImpl() {
        throw new Error('still booting');
      },
      setTimeoutImpl(callback) {
        callback();
      },
    }),
    /still booting/
  );
});
