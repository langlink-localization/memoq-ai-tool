const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { spawnSync } = require('child_process');

const { buildLiteLLMConfig, serializeLiteLLMConfigYaml } = require('./litellmConfig');

function candidateScriptNames(platform) {
  if (platform === 'win32') {
    return [
      'litellm.exe',
      'litellm.cmd',
      'litellm.bat',
      'litellm-script.py',
      'litellm-proxy.exe',
      'litellm-proxy.cmd',
      'litellm-proxy.bat',
      'litellm-proxy-script.py',
    ];
  }

  return ['litellm', 'litellm-proxy'];
}

function joinPathForPlatform(platform, dirPath, fileName) {
  return platform === 'win32'
    ? path.win32.join(dirPath, fileName)
    : path.posix.join(dirPath, fileName);
}

function resolveLiteLLMScriptsDir(pythonBin) {
  const result = spawnSync(
    pythonBin,
    [
      '-c',
      'import sysconfig; print(sysconfig.get_path("scripts"))',
    ],
    {
      encoding: 'utf8',
    }
  );

  if (result.error || result.status !== 0) {
    return '';
  }

  return String(result.stdout || '').trim();
}

function bundledRuntimeScriptsDir(runtimeDir, platform) {
  return platform === 'win32'
    ? path.join(runtimeDir, 'Scripts')
    : path.join(runtimeDir, 'bin');
}

function resolveBundledLiteLLMRuntimeDir(options = {}, dependencies = {}) {
  const pathExists = dependencies.pathExists || fs.existsSync;
  const explicitDir = String(options?.bundledRuntimeDir || '').trim();
  if (explicitDir) {
    return explicitDir;
  }

  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'mqllmrt'));
    candidates.push(path.join(process.resourcesPath, 'llmrt'));
    candidates.push(path.join(process.resourcesPath, 'litellm-runtime'));
  }

  candidates.push(path.resolve(__dirname, '..', 'build-resources', 'llmrt'));
  candidates.push(path.resolve(__dirname, '..', 'build-resources', 'litellm-runtime'));

  return candidates.find((candidate) => pathExists(candidate)) || '';
}

function resolveBundledLiteLLMCommand(options = {}, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const pathExists = dependencies.pathExists || fs.existsSync;
  const runtimeDir = resolveBundledLiteLLMRuntimeDir(options, dependencies);
  if (!runtimeDir) return '';

  const scriptsDir = bundledRuntimeScriptsDir(runtimeDir, platform);
  const candidates = candidateScriptNames(platform).map((name) => joinPathForPlatform(platform, scriptsDir, name));
  return candidates.find((candidate) => pathExists(candidate)) || '';
}

function resolveBundledLiteLLMPython(options = {}, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const pathExists = dependencies.pathExists || fs.existsSync;
  const runtimeDir = resolveBundledLiteLLMRuntimeDir(options, dependencies);
  if (!runtimeDir) return '';

  const candidate = path.join(bundledRuntimeScriptsDir(runtimeDir, platform), platform === 'win32' ? 'python.exe' : 'python');
  return pathExists(candidate) ? candidate : '';
}

function resolveLiteLLMCommand(options = {}, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const pathExists = dependencies.pathExists || fs.existsSync;
  const resolveScriptsDir = dependencies.resolveScriptsDir || resolveLiteLLMScriptsDir;

  const cliBin = String(options?.cliBin || '').trim();
  if (cliBin) return cliBin;

  const bundledCommand = resolveBundledLiteLLMCommand(options, dependencies);
  if (bundledCommand) return bundledCommand;

  const pythonBin = String(options?.pythonBin || '').trim();
  if (pythonBin) {
    const scriptsDir = String(resolveScriptsDir(pythonBin) || '').trim();
    const candidates = scriptsDir
      ? candidateScriptNames(platform).map((name) => joinPathForPlatform(platform, scriptsDir, name))
      : [];
    const match = candidates.find((candidate) => pathExists(candidate));
    if (match) return match;
  }

  return platform === 'win32' ? 'litellm.exe' : 'litellm';
}

function buildLiteLLMStartCommand(options, dependencies) {
  const command = resolveLiteLLMCommand(options, dependencies);
  const configPath = String(options?.configPath || '').trim();
  const host = String(options?.host || '127.0.0.1');
  const port = String(options?.port || 4000);

  return {
    command,
    args: [
      '--config',
      configPath,
      '--host',
      host,
      '--port',
      port,
    ],
  };
}

function buildLiteLLMInstallCommand(options = {}) {
  const pythonBin = String(options?.pythonBin || resolveBundledLiteLLMPython(options) || '').trim();
  if (pythonBin) {
    return `${pythonBin} -m pip install "litellm[proxy]"`;
  }

  return process.platform === 'win32'
    ? 'py -m pip install "litellm[proxy]"'
    : 'python3 -m pip install "litellm[proxy]"';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createLiteLLMManager(options = {}) {
  const runtimeDir = options.runtimeDir || path.join(process.cwd(), '.runtime', 'litellm');
  let child = null;
  let status = {
    enabled: false,
    running: false,
    command: '',
    configPath: path.join(runtimeDir, 'config.yaml'),
    pid: null,
    error: '',
    installCommand: '',
  };

  function toUserFacingError(error, installCommand) {
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'ENOENT') {
      return `LiteLLM is not installed. Install it with: ${installCommand}`;
    }
    return String(error?.message || 'LiteLLM failed to start.');
  }

  function writeConfig(config) {
    ensureDir(runtimeDir);
    const configPath = path.join(runtimeDir, 'config.yaml');
    const litellmConfig = buildLiteLLMConfig(config);
    const yaml = serializeLiteLLMConfigYaml(litellmConfig);
    fs.writeFileSync(configPath, yaml, 'utf8');
    status.configPath = configPath;
    return configPath;
  }

  function stop() {
    if (child && !child.killed) {
      child.kill();
    }
    child = null;
    status.running = false;
    status.pid = null;
  }

  function applyConfig(config) {
    const litellmSettings = config?.litellm || {};
    status.enabled = !!litellmSettings.enabled;

    if (!litellmSettings.enabled) {
      stop();
      status.command = '';
      status.error = '';
      status.installCommand = '';
      return status;
    }

    const configPath = writeConfig(config);
    const installCommand = buildLiteLLMInstallCommand({
      pythonBin: litellmSettings.pythonBin,
    });
    const command = buildLiteLLMStartCommand({
      cliBin: litellmSettings.cliBin,
      pythonBin: litellmSettings.pythonBin,
      configPath,
      host: litellmSettings.host,
      port: litellmSettings.port,
    });

    stop();

    try {
      child = spawn(command.command, command.args, {
        cwd: runtimeDir,
        stdio: 'ignore',
      });

      status.running = true;
      status.pid = child.pid || null;
      status.command = [command.command].concat(command.args).join(' ');
      status.error = '';
      status.installCommand = installCommand;

      child.on('exit', (code, signal) => {
        status.running = false;
        status.pid = null;
        if (code && code !== 0) {
          status.error = `LiteLLM exited with code ${code}`;
        } else if (signal) {
          status.error = `LiteLLM stopped by signal ${signal}`;
        }
      });

      child.on('error', (error) => {
        status.running = false;
        status.pid = null;
        status.error = toUserFacingError(error, installCommand);
      });
    } catch (error) {
      status.running = false;
      status.pid = null;
      status.command = [command.command].concat(command.args).join(' ');
      status.error = toUserFacingError(error, installCommand);
      status.installCommand = installCommand;
    }

    return status;
  }

  function getStatus() {
    return { ...status };
  }

  return {
    applyConfig,
    getStatus,
    stop,
    writeConfig,
  };
}

module.exports = {
  buildLiteLLMStartCommand,
  buildLiteLLMInstallCommand,
  createLiteLLMManager,
  joinPathForPlatform,
  resolveBundledLiteLLMCommand,
  resolveBundledLiteLLMPython,
  resolveBundledLiteLLMRuntimeDir,
  resolveLiteLLMCommand,
  resolveLiteLLMScriptsDir,
};
