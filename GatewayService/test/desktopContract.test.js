const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../src/desktopContract');

test('desktop contract exposes stable product metadata', () => {
  assert.equal(contract.PRODUCT_NAME, 'memoQ AI Gateway');
  assert.equal(contract.CONTRACT_VERSION, '1');
  assert.equal(contract.DEFAULT_HOST, '127.0.0.1');
  assert.equal(contract.DEFAULT_PORT, 5271);
});

test('desktop contract exposes required v1 desktop routes', () => {
  assert.equal(contract.ROUTES.health, '/health');
  assert.equal(contract.ROUTES.desktopVersion, '/desktop/version');
  assert.equal(contract.ROUTES.integrationStatus, '/desktop/integration/status');
  assert.equal(contract.ROUTES.integrationInstall, '/desktop/integration/install');
  assert.equal(contract.ROUTES.integrationRepair, '/desktop/integration/repair');
  assert.equal(contract.ROUTES.mtTranslate, '/mt/translate');
});
