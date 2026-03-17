const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildIntegrationStatusViewModel,
  getInstallationStatusClass,
} = require('../src/public/uiState');

test('buildIntegrationStatusViewModel prefers the primary installation status over aggregate status', () => {
  const viewModel = buildIntegrationStatusViewModel({
    status: 'installed',
    installations: [
      {
        name: 'memoQ 10.11',
        status: 'needs_repair',
        addinsDir: 'C:\\Program Files\\memoQ 10.11\\Addins',
        clientDevConfigTarget: 'C:\\Users\\User\\AppData\\Roaming\\Kilgray\\ClientDevConfig.xml',
      },
      {
        name: 'memoQ 9.14',
        status: 'installed',
        addinsDir: 'C:\\Program Files\\memoQ 9.14\\Addins',
        clientDevConfigTarget: 'C:\\Users\\User\\AppData\\Roaming\\Kilgray\\ClientDevConfig.xml',
      },
    ],
    assets: {
      pluginDllExists: true,
      clientDevConfigExists: true,
    },
  });

  assert.equal(viewModel.overallStatus, 'installed');
  assert.equal(viewModel.installationName, 'memoQ 10.11');
  assert.equal(viewModel.installationStatus, 'needs_repair');
  assert.equal(viewModel.installationStatusClass, 'warn');
  assert.equal(viewModel.requestedMemoQVersion, '11');
  assert.equal(viewModel.customInstallDir, '');
});

test('getInstallationStatusClass maps install states to presentation classes', () => {
  assert.equal(getInstallationStatusClass('installed'), 'ok');
  assert.equal(getInstallationStatusClass('needs_repair'), 'warn');
  assert.equal(getInstallationStatusClass('not_installed'), 'bad');
});

test('buildIntegrationStatusViewModel keeps custom memoQ install configuration details', () => {
  const viewModel = buildIntegrationStatusViewModel({
    status: 'not_installed',
    requestedMemoQVersion: '12',
    customInstallDir: 'D:\\Apps\\memoQ\\memoQ-12',
    installations: [
      {
        name: 'memoQ-12',
        status: 'not_installed',
        addinsDir: 'D:\\Apps\\memoQ\\memoQ-12\\Addins',
        clientDevConfigTarget: 'C:\\Users\\User\\AppData\\Roaming\\Kilgray\\ClientDevConfig.xml',
      },
    ],
    assets: {
      pluginDllExists: true,
      clientDevConfigExists: true,
    },
  });

  assert.equal(viewModel.requestedMemoQVersion, '12');
  assert.equal(viewModel.customInstallDir, 'D:\\Apps\\memoQ\\memoQ-12');
});
