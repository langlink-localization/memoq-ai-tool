function sleep(delayMs, setTimeoutImpl = setTimeout) {
  return new Promise((resolve) => {
    setTimeoutImpl(resolve, delayMs);
  });
}

async function waitForHealth(options = {}) {
  const url = String(options.url || 'http://127.0.0.1:5271/health');
  const attempts = Math.max(Number(options.attempts || 10), 1);
  const delayMs = Math.max(Number(options.delayMs || 1000), 0);
  const fetchImpl = options.fetchImpl || global.fetch;
  const setTimeoutImpl = options.setTimeoutImpl || setTimeout;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available for smoke health checks.');
  }

  let lastError = new Error(`Health check failed for ${url}`);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url);
      if (response && response.status === 200) {
        return;
      }

      lastError = new Error(`Health check returned ${response ? response.status : 'no response'} for ${url}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < attempts) {
      await sleep(delayMs, setTimeoutImpl);
    }
  }

  throw lastError;
}

async function main() {
  await waitForHealth();
  process.stdout.write('health-ok\n');
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  waitForHealth,
};
