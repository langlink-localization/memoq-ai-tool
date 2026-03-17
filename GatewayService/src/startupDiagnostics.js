const fs = require('fs');
const path = require('path');

function getRuntimeDir() {
  return path.join(process.env.APPDATA || process.cwd(), 'memoq-ai-gateway');
}

function getStartupLogPath() {
  return path.join(getRuntimeDir(), 'startup.log');
}

function ensureRuntimeDir() {
  const runtimeDir = getRuntimeDir();
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
  return runtimeDir;
}

function safeErrorText(error) {
  if (!error) return 'unknown error';
  if (error instanceof Error) {
    return error.stack || error.message || String(error);
  }
  return String(error);
}

function appendStartupLog(message, error) {
  try {
    ensureRuntimeDir();
    const timestamp = new Date().toISOString();
    const suffix = error ? `\n${safeErrorText(error)}` : '';
    fs.appendFileSync(getStartupLogPath(), `[${timestamp}] ${message}${suffix}\n`, 'utf8');
  } catch (_error) {
    // Keep startup diagnostics best-effort only.
  }
}

function formatStartupFailure(error, config = {}) {
  if (error && error.code === 'EADDRINUSE') {
    return {
      title: 'Port 5271 Is In Use',
      message: `The desktop gateway could not start because ${config.host || '127.0.0.1'}:${config.port || 5271} is already in use.\n\nClose the process using that port or change the gateway port in the config file, then try again.\n\nStartup log: ${getStartupLogPath()}`,
    };
  }

  return {
    title: 'memoQ AI Gateway Failed To Start',
    message: `The desktop app could not finish starting.\n\n${safeErrorText(error)}\n\nStartup log: ${getStartupLogPath()}`,
  };
}

module.exports = {
  appendStartupLog,
  formatStartupFailure,
  getRuntimeDir,
  getStartupLogPath,
  safeErrorText,
};
