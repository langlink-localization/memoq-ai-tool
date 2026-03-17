const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGatewayBaseUrl } = require('../src/rendererLocation');

test('buildGatewayBaseUrl serves the local desktop gateway origin', () => {
  assert.equal(buildGatewayBaseUrl('127.0.0.1', 5271), 'http://127.0.0.1:5271/');
  assert.equal(buildGatewayBaseUrl('localhost', 8080), 'http://localhost:8080/');
});
