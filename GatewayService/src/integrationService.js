const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { INTEGRATION, ERROR_CODES } = require('./desktopContract');

class IntegrationError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const SUPPORTED_MEMOQ_VERSIONS = ['10', '11', '12'];

function safeReadDir(dirPath, fsImpl = fs) {
  try {
    return fsImpl.readdirSync(dirPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
}

function buildInstallationRecord(rootDir) {
  return {
    name: path.basename(rootDir),
    rootDir,
    addinsDir: path.join(rootDir, 'Addins'),
  };
}

function normalizeVersion(version) {
  const normalized = String(version || '').trim();
  return SUPPORTED_MEMOQ_VERSIONS.includes(normalized) ? normalized : '11';
}

function defaultMemoQRootDir(version) {
  return path.join('C:\\Program Files', 'memoQ', `memoQ-${normalizeVersion(version)}`);
}

function buildMemoQRootCandidates(options = {}) {
  const preferredVersion = normalizeVersion(options.memoqVersion);
  const customInstallDir = String(options.customInstallDir || '').trim();
  const versions = [preferredVersion].concat(SUPPORTED_MEMOQ_VERSIONS.filter((version) => version !== preferredVersion));
  const candidates = [];
  const seen = new Set();

  function pushCandidate(rootDir) {
    const normalized = String(rootDir || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  }

  if (customInstallDir) {
    pushCandidate(customInstallDir);
  }

  versions.forEach((version) => {
    pushCandidate(defaultMemoQRootDir(version));
  });

  return candidates;
}

function parseVersionParts(name) {
  const match = String(name || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;

  return [match[1], match[2], match[3]]
    .map((part) => Number.parseInt(part || '0', 10));
}

function compareInstallationNames(leftName, rightName) {
  const leftVersion = parseVersionParts(leftName);
  const rightVersion = parseVersionParts(rightName);

  if (leftVersion && rightVersion) {
    const maxLength = Math.max(leftVersion.length, rightVersion.length);
    for (let index = 0; index < maxLength; index += 1) {
      const diff = (rightVersion[index] || 0) - (leftVersion[index] || 0);
      if (diff !== 0) {
        return diff;
      }
    }
  }

  return String(rightName || '').localeCompare(String(leftName || ''), 'en', { numeric: true, sensitivity: 'base' });
}

function findMemoQDesktopInstallations(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const integrationConfig = options.integrationConfig || {};
  const rootCandidates = Array.isArray(options.rootCandidates) && options.rootCandidates.length
    ? options.rootCandidates
    : buildMemoQRootCandidates({
        memoqVersion: options.memoqVersion || integrationConfig.memoqVersion,
        customInstallDir: options.customInstallDir || integrationConfig.customInstallDir,
      });
  const discovered = [];
  const seen = new Set();

  rootCandidates.forEach((rootDir) => {
    const addinsDir = path.join(rootDir, 'Addins');
    if (!fsImpl.existsSync(addinsDir)) return;
    if (seen.has(addinsDir)) return;

    seen.add(addinsDir);
    discovered.push(buildInstallationRecord(rootDir));
  });

  return discovered;
}

function resolveClientDevConfigTarget(options = {}) {
  const env = options.env || process.env;
  const appDataDir = String(options.appDataDir || env.APPDATA || '').trim();
  if (!appDataDir) {
    throw new IntegrationError(
      'APPDATA is required to install ClientDevConfig.xml.',
      ERROR_CODES.integrationNotInstalled,
      500
    );
  }

  return path.join(appDataDir, INTEGRATION.clientDevConfigVendorDir, INTEGRATION.clientDevConfigName);
}

function resolveAssetCandidates(serviceDir) {
  const repoRoot = path.resolve(serviceDir, '..', '..');
  const bundledRoot = path.join(process.resourcesPath || '', 'memoq-integration');
  const bundledResourceRoot = String(process.resourcesPath || '').trim();
  return {
    pluginDll: [
      path.join(bundledResourceRoot, INTEGRATION.pluginDllName),
      path.join(bundledRoot, INTEGRATION.pluginDllName),
      path.join(repoRoot, 'MultiSupplierMTPlugin', 'bin', 'Release', 'net48', INTEGRATION.pluginDllName),
    ],
    clientDevConfig: [
      path.join(bundledResourceRoot, INTEGRATION.clientDevConfigName),
      path.join(bundledRoot, INTEGRATION.clientDevConfigName),
      path.join(repoRoot, 'doc', INTEGRATION.clientDevConfigName),
    ],
  };
}

function pickFirstExisting(paths, fsImpl = fs) {
  return paths.find((candidate) => fsImpl.existsSync(candidate)) || '';
}

function resolveIntegrationAssets(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const serviceDir = options.serviceDir || __dirname;
  const candidates = resolveAssetCandidates(serviceDir);
  const pluginDll = pickFirstExisting(candidates.pluginDll, fsImpl);
  const clientDevConfig = pickFirstExisting(candidates.clientDevConfig, fsImpl);

  return {
    pluginDll,
    clientDevConfig,
    pluginDllExists: Boolean(pluginDll),
    clientDevConfigExists: Boolean(clientDevConfig),
  };
}

function ensureParentDir(filePath, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyFileWithAccessErrorMapping(source, target, fsImpl = fs) {
  try {
    ensureParentDir(target, fsImpl);
    fsImpl.copyFileSync(source, target);
  } catch (error) {
    if (error && (error.code === 'EACCES' || error.code === 'EPERM')) {
      throw new IntegrationError(
        `Writing ${target} requires elevated Windows permissions.`,
        ERROR_CODES.installRequiresElevation,
        403
      );
    }
    throw error;
  }
}

function encodePowerShellCommand(script) {
  return Buffer.from(String(script || ''), 'utf16le').toString('base64');
}

function escapePowerShellString(value) {
  return String(value || '').replace(/'/g, "''");
}

function buildElevatedInstallScript(steps) {
  const lines = [
    '$ErrorActionPreference = "Stop"',
  ];

  steps.forEach((step) => {
    lines.push(`New-Item -ItemType Directory -Force -Path '${escapePowerShellString(path.dirname(step.target))}' | Out-Null`);
    lines.push(`Copy-Item -LiteralPath '${escapePowerShellString(step.source)}' -Destination '${escapePowerShellString(step.target)}' -Force`);
  });

  return lines.join('; ');
}

function buildElevationLauncherCommand(encodedCommand) {
  const powershellExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const launcherScript = [
    '$process = Start-Process',
    `-FilePath '${escapePowerShellString(powershellExe)}'`,
    '-Verb RunAs',
    '-Wait',
    '-PassThru',
    `-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${escapePowerShellString(encodedCommand)}')`,
    ';',
    'exit $process.ExitCode',
  ].join(' ');

  return {
    command: powershellExe,
    args: [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      launcherScript,
    ],
  };
}

function runElevatedInstall(steps, options = {}) {
  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;
  const script = buildElevatedInstallScript(steps);
  const encodedCommand = encodePowerShellCommand(script);
  const launcher = buildElevationLauncherCommand(encodedCommand);
  const result = spawnSyncImpl(launcher.command, launcher.args, {
    windowsHide: true,
    stdio: 'ignore',
  });

  if (result.error) {
    const error = result.error;
    if (error.code === 'ENOENT') {
      throw new IntegrationError(
        'Windows PowerShell was not found. Run the installer from an elevated PowerShell session.',
        ERROR_CODES.installRequiresElevation,
        500
      );
    }
    throw new IntegrationError(
      `Failed to start elevated installer: ${error.message}`,
      ERROR_CODES.installRequiresElevation,
      500
    );
  }

  if (result.status !== 0) {
    throw new IntegrationError(
      result.status === 1
        ? 'Administrator approval was canceled before the memoQ integration could be installed.'
        : `Elevated memoQ integration install failed with exit code ${result.status}.`,
      ERROR_CODES.installRequiresElevation,
      403
    );
  }
}

function getIntegrationStatus(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const env = options.env || process.env;
  const serviceDir = options.serviceDir || __dirname;
  const integrationConfig = options.integrationConfig || {};
  const installations = findMemoQDesktopInstallations({
    fsImpl,
    integrationConfig,
    rootCandidates: options.rootCandidates,
    memoqVersion: options.memoqVersion,
    customInstallDir: options.customInstallDir,
  });
  const assets = resolveIntegrationAssets({ fsImpl, serviceDir });
  const clientDevConfigTarget = resolveClientDevConfigTarget({ env, appDataDir: options.appDataDir });

  const enrichedInstallations = installations.map((installation) => {
    const pluginTarget = path.join(installation.addinsDir, INTEGRATION.pluginDllName);
    const pluginInstalled = fsImpl.existsSync(pluginTarget);
    const clientDevConfigInstalled = fsImpl.existsSync(clientDevConfigTarget);

    let status = 'not_installed';
    if (pluginInstalled && clientDevConfigInstalled) {
      status = 'installed';
    } else if (pluginInstalled || clientDevConfigInstalled) {
      status = 'needs_repair';
    }

    return {
      ...installation,
      pluginTarget,
      pluginInstalled,
      clientDevConfigTarget,
      clientDevConfigInstalled,
      status,
    };
  });

  let overallStatus = 'not_found';
  if (enrichedInstallations.length > 0) {
    overallStatus = enrichedInstallations.some((item) => item.status === 'installed')
      ? 'installed'
      : enrichedInstallations.some((item) => item.status === 'needs_repair')
        ? 'needs_repair'
        : 'not_installed';
  }

  return {
    status: overallStatus,
    requestedMemoQVersion: normalizeVersion(options.memoqVersion || integrationConfig.memoqVersion),
    customInstallDir: String(options.customInstallDir || integrationConfig.customInstallDir || ''),
    installations: enrichedInstallations,
    assets,
  };
}

function installIntegration(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const env = options.env || process.env;
  const serviceDir = options.serviceDir || __dirname;
  const platform = options.platform || process.platform;
  const status = getIntegrationStatus({
    fsImpl,
    env,
    serviceDir,
    appDataDir: options.appDataDir,
    integrationConfig: options.integrationConfig,
    rootCandidates: options.rootCandidates,
    memoqVersion: options.memoqVersion,
    customInstallDir: options.customInstallDir,
  });

  if (!status.installations.length) {
    throw new IntegrationError(
      'No memoQ desktop installation was detected on this machine.',
      ERROR_CODES.integrationNotInstalled,
      404
    );
  }

  if (!status.assets.pluginDllExists || !status.assets.clientDevConfigExists) {
    throw new IntegrationError(
      'Integration assets are missing. Build the plugin before packaging the desktop app.',
      ERROR_CODES.integrationNotInstalled,
      500
    );
  }

  const installation = status.installations[0];
  const pluginTarget = path.join(installation.addinsDir, INTEGRATION.pluginDllName);

  try {
    copyFileWithAccessErrorMapping(status.assets.pluginDll, pluginTarget, fsImpl);
  } catch (error) {
    if (!(error instanceof IntegrationError) || error.code !== ERROR_CODES.installRequiresElevation || options.allowElevation === false || platform !== 'win32') {
      throw error;
    }

    runElevatedInstall([
      {
        source: status.assets.pluginDll,
        target: pluginTarget,
      },
    ], {
      spawnSyncImpl: options.spawnSyncImpl,
    });
  }

  copyFileWithAccessErrorMapping(status.assets.clientDevConfig, installation.clientDevConfigTarget, fsImpl);

  return getIntegrationStatus({
    fsImpl,
    env,
    serviceDir,
    appDataDir: options.appDataDir,
    integrationConfig: options.integrationConfig,
    rootCandidates: options.rootCandidates,
    memoqVersion: options.memoqVersion,
    customInstallDir: options.customInstallDir,
  });
}

module.exports = {
  buildMemoQRootCandidates,
  compareInstallationNames,
  defaultMemoQRootDir,
  IntegrationError,
  findMemoQDesktopInstallations,
  getIntegrationStatus,
  installIntegration,
  normalizeVersion,
  buildElevatedInstallScript,
  buildElevationLauncherCommand,
  resolveIntegrationAssets,
  runElevatedInstall,
  SUPPORTED_MEMOQ_VERSIONS,
};
