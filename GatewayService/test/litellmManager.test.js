const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLiteLLMInstallCommand,
  buildLiteLLMStartCommand,
  joinPathForPlatform,
  resolveBundledLiteLLMCommand,
  resolveBundledLiteLLMPython,
  resolveBundledLiteLLMRuntimeDir,
  resolveLiteLLMCommand,
} = require('../src/litellmManager');

test('resolveLiteLLMCommand prefers explicit cliBin when provided', () => {
  const command = resolveLiteLLMCommand(
    {
      cliBin: '/opt/litellm/bin/litellm',
      pythonBin: 'python3',
    },
    {
      platform: 'linux',
      resolveScriptsDir() {
        throw new Error('should not resolve scripts dir when cliBin is explicit');
      },
    }
  );

  assert.equal(command, '/opt/litellm/bin/litellm');
});

test('resolveLiteLLMCommand derives the console script from python scripts dir', () => {
  const command = resolveLiteLLMCommand(
    {
      pythonBin: 'python3',
    },
    {
      platform: 'linux',
      resolveScriptsDir(pythonBin) {
        assert.equal(pythonBin, 'python3');
        return '/home/user/.pyenv/versions/3.11.13/bin';
      },
      pathExists(candidate) {
        return candidate === '/home/user/.pyenv/versions/3.11.13/bin/litellm';
      },
    }
  );

  assert.equal(command, '/home/user/.pyenv/versions/3.11.13/bin/litellm');
});

test('resolveBundledLiteLLMRuntimeDir prefers an explicit bundled runtime directory', () => {
  const runtimeDir = resolveBundledLiteLLMRuntimeDir(
    { bundledRuntimeDir: 'C:\\bundle\\litellm-runtime' },
    {
      pathExists(candidate) {
        return candidate === 'C:\\bundle\\litellm-runtime';
      },
    }
  );

  assert.equal(runtimeDir, 'C:\\bundle\\litellm-runtime');
});

test('resolveBundledLiteLLMCommand discovers packaged LiteLLM scripts before PATH fallbacks', () => {
  const command = resolveBundledLiteLLMCommand(
    {
      bundledRuntimeDir: 'C:\\bundle\\litellm-runtime',
    },
    {
      platform: 'win32',
      pathExists(candidate) {
        return candidate === 'C:\\bundle\\litellm-runtime\\Scripts\\litellm.exe';
      },
    }
  );

  assert.equal(command, 'C:\\bundle\\litellm-runtime\\Scripts\\litellm.exe');
});

test('resolveBundledLiteLLMPython discovers packaged python runtime', () => {
  const pythonBin = resolveBundledLiteLLMPython(
    {
      bundledRuntimeDir: 'C:\\bundle\\litellm-runtime',
    },
    {
      platform: 'win32',
      pathExists(candidate) {
        return candidate === 'C:\\bundle\\litellm-runtime\\Scripts\\python.exe';
      },
    }
  );

  assert.equal(pythonBin, 'C:\\bundle\\litellm-runtime\\Scripts\\python.exe');
});

test('resolveLiteLLMCommand prefers bundled runtime scripts when available', () => {
  const command = resolveLiteLLMCommand(
    {
      bundledRuntimeDir: 'C:\\bundle\\litellm-runtime',
      pythonBin: 'py',
    },
    {
      platform: 'win32',
      pathExists(candidate) {
        return candidate === 'C:\\bundle\\litellm-runtime\\Scripts\\litellm.exe';
      },
      resolveScriptsDir() {
        throw new Error('should not resolve external python scripts when bundled runtime exists');
      },
    }
  );

  assert.equal(command, 'C:\\bundle\\litellm-runtime\\Scripts\\litellm.exe');
});

test('resolveLiteLLMCommand falls back to a PATH command when no local script is found', () => {
  const command = resolveLiteLLMCommand(
    {
      pythonBin: 'python3',
    },
    {
      platform: 'linux',
      resolveScriptsDir() {
        return '/missing/bin';
      },
      pathExists() {
        return false;
      },
    }
  );

  assert.equal(command, 'litellm');
});

test('joinPathForPlatform keeps target-platform separators instead of host separators', () => {
  assert.equal(
    joinPathForPlatform('linux', '/home/user/.pyenv/versions/3.11.13/bin', 'litellm'),
    '/home/user/.pyenv/versions/3.11.13/bin/litellm'
  );
  assert.equal(
    joinPathForPlatform('win32', 'C:\\Python311\\Scripts', 'litellm.exe'),
    'C:\\Python311\\Scripts\\litellm.exe'
  );
});

test('buildLiteLLMStartCommand uses resolved LiteLLM cli with config path and bind info', () => {
  const command = buildLiteLLMStartCommand(
    {
      pythonBin: 'python3',
      configPath: '/tmp/memoq-ai-gateway/litellm-config.yaml',
      host: '127.0.0.1',
      port: 4000,
    },
    {
      platform: 'linux',
      resolveScriptsDir() {
        return '/home/user/.pyenv/versions/3.11.13/bin';
      },
      pathExists(candidate) {
        return candidate === '/home/user/.pyenv/versions/3.11.13/bin/litellm';
      },
    }
  );

  assert.equal(command.command, '/home/user/.pyenv/versions/3.11.13/bin/litellm');
  assert.deepEqual(command.args, [
    '--config',
    '/tmp/memoq-ai-gateway/litellm-config.yaml',
    '--host',
    '127.0.0.1',
    '--port',
    '4000',
  ]);
});

test('buildLiteLLMInstallCommand uses the configured python entrypoint', () => {
  assert.equal(
    buildLiteLLMInstallCommand({ pythonBin: 'py -3.11' }),
    'py -3.11 -m pip install "litellm[proxy]"'
  );
});
