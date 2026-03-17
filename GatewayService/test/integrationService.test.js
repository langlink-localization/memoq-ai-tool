const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildElevatedInstallScript,
  buildElevationLauncherCommand,
  buildMemoQRootCandidates,
  defaultMemoQRootDir,
  findMemoQDesktopInstallations,
  getIntegrationStatus,
  installIntegration,
  IntegrationError,
} = require('../src/integrationService');

function createFsStub(existingPaths = []) {
  const paths = new Set(existingPaths);
  return {
    existsSync(targetPath) {
      return paths.has(targetPath);
    },
    readdirSync() {
      return [];
    },
    mkdirSync() {},
    copyFileSync() {},
  };
}

test('buildMemoQRootCandidates prefers the selected standard version and keeps 10/11/12 as fallbacks', () => {
  assert.deepEqual(
    buildMemoQRootCandidates({ memoqVersion: '11' }),
    [
      'C:\\Program Files\\memoQ\\memoQ-11',
      'C:\\Program Files\\memoQ\\memoQ-10',
      'C:\\Program Files\\memoQ\\memoQ-12',
    ]
  );
});

test('buildMemoQRootCandidates prioritizes a custom installation root when provided', () => {
  assert.deepEqual(
    buildMemoQRootCandidates({
      memoqVersion: '12',
      customInstallDir: 'D:\\Apps\\memoQ\\memoQ-12',
    }),
    [
      'D:\\Apps\\memoQ\\memoQ-12',
      'C:\\Program Files\\memoQ\\memoQ-12',
      'C:\\Program Files\\memoQ\\memoQ-10',
      'C:\\Program Files\\memoQ\\memoQ-11',
    ]
  );
});

test('findMemoQDesktopInstallations uses supported memoQ 10/11/12 default paths', () => {
  const installations = findMemoQDesktopInstallations({
    fsImpl: createFsStub([
      'C:\\Program Files\\memoQ\\memoQ-11\\Addins',
      'C:\\Program Files\\memoQ\\memoQ-12\\Addins',
    ]),
    integrationConfig: {
      memoqVersion: '11',
    },
  });

  assert.deepEqual(
    installations.map((item) => item.rootDir),
    [
      'C:\\Program Files\\memoQ\\memoQ-11',
      'C:\\Program Files\\memoQ\\memoQ-12',
    ]
  );
});

test('getIntegrationStatus exposes the requested memoQ version and custom path', () => {
  const fsImpl = createFsStub([
    'D:\\Apps\\memoQ\\memoQ-10\\Addins',
    'C:\\Users\\User\\AppData\\Roaming\\Kilgray\\ClientDevConfig.xml',
    'C:\\repo\\doc\\ClientDevConfig.xml',
    'C:\\repo\\MultiSupplierMTPlugin\\bin\\Release\\net48\\MemoQ.AIGateway.Plugin.dll',
  ]);

  const status = getIntegrationStatus({
    fsImpl,
    env: { APPDATA: 'C:\\Users\\User\\AppData\\Roaming' },
    serviceDir: 'C:\\repo\\GatewayService\\src',
    integrationConfig: {
      memoqVersion: '10',
      customInstallDir: 'D:\\Apps\\memoQ\\memoQ-10',
    },
  });

  assert.equal(status.requestedMemoQVersion, '10');
  assert.equal(status.customInstallDir, 'D:\\Apps\\memoQ\\memoQ-10');
  assert.equal(status.installations[0].rootDir, 'D:\\Apps\\memoQ\\memoQ-10');
  assert.equal(defaultMemoQRootDir('11'), 'C:\\Program Files\\memoQ\\memoQ-11');
});

test('buildElevatedInstallScript copies memoQ assets with explicit directories', () => {
  const script = buildElevatedInstallScript([
    {
      source: 'C:\\bundle\\MemoQ.AIGateway.Plugin.dll',
      target: 'C:\\Program Files\\memoQ\\memoQ-11\\Addins\\MemoQ.AIGateway.Plugin.dll',
    },
  ]);

  assert.match(script, /Copy-Item -LiteralPath 'C:\\bundle\\MemoQ\.AIGateway\.Plugin\.dll'/);
  assert.match(script, /New-Item -ItemType Directory -Force -Path 'C:\\Program Files\\memoQ\\memoQ-11\\Addins'/);
});

test('buildElevationLauncherCommand wraps the elevated install in a runas PowerShell call', () => {
  const launcher = buildElevationLauncherCommand('QUJD');

  assert.match(launcher.command, /powershell\.exe$/i);
  assert.ok(launcher.args.includes('-Command'));
  assert.match(launcher.args[launcher.args.length - 1], /-Verb RunAs/);
  assert.match(launcher.args[launcher.args.length - 1], /-EncodedCommand','QUJD'/);
});

test('installIntegration relaunches with elevation when Program Files copy requires admin rights', () => {
  const copiedTargets = [];
  const elevatedInvocations = [];
  const fsImpl = {
    existsSync(targetPath) {
      return [
        'C:\\Program Files\\memoQ\\memoQ-11\\Addins',
        'C:\\Users\\User\\AppData\\Roaming\\Kilgray\\ClientDevConfig.xml',
        'C:\\repo\\doc\\ClientDevConfig.xml',
        'C:\\repo\\MultiSupplierMTPlugin\\bin\\Release\\net48\\MemoQ.AIGateway.Plugin.dll',
      ].includes(targetPath) || copiedTargets.includes(targetPath);
    },
    readdirSync() {
      return [];
    },
    mkdirSync() {},
    copyFileSync(source, target) {
      if (target.includes('\\Addins\\')) {
        const error = new Error('access denied');
        error.code = 'EACCES';
        throw error;
      }
      copiedTargets.push(target);
    },
  };

  const status = installIntegration({
    fsImpl,
    env: { APPDATA: 'C:\\Users\\User\\AppData\\Roaming' },
    serviceDir: 'C:\\repo\\GatewayService\\src',
    integrationConfig: {
      memoqVersion: '11',
    },
    platform: 'win32',
    spawnSyncImpl(command, args) {
      elevatedInvocations.push({ command, args });
      copiedTargets.push('C:\\Program Files\\memoQ\\memoQ-11\\Addins\\MemoQ.AIGateway.Plugin.dll');
      return { status: 0 };
    },
  });

  assert.equal(elevatedInvocations.length, 1);
  assert.equal(status.status, 'installed');
  assert.ok(copiedTargets.includes('C:\\Users\\User\\AppData\\Roaming\\Kilgray\\ClientDevConfig.xml'));
});

test('installIntegration surfaces UAC cancellation as an elevation error', () => {
  const fsImpl = {
    existsSync(targetPath) {
      return [
        'C:\\Program Files\\memoQ\\memoQ-11\\Addins',
        'C:\\repo\\doc\\ClientDevConfig.xml',
        'C:\\repo\\MultiSupplierMTPlugin\\bin\\Release\\net48\\MemoQ.AIGateway.Plugin.dll',
      ].includes(targetPath);
    },
    readdirSync() {
      return [];
    },
    mkdirSync() {},
    copyFileSync(_source, target) {
      if (target.includes('\\Addins\\')) {
        const error = new Error('access denied');
        error.code = 'EACCES';
        throw error;
      }
    },
  };

  assert.throws(() => installIntegration({
    fsImpl,
    env: { APPDATA: 'C:\\Users\\User\\AppData\\Roaming' },
    serviceDir: 'C:\\repo\\GatewayService\\src',
    integrationConfig: {
      memoqVersion: '11',
    },
    platform: 'win32',
    spawnSyncImpl() {
      return { status: 1 };
    },
  }), (error) => {
    assert.ok(error instanceof IntegrationError);
    assert.equal(error.code, 'INSTALL_REQUIRES_ELEVATION');
    assert.match(error.message, /Administrator approval was canceled/i);
    return true;
  });
});
