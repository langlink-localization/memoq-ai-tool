function createMtRuntimeControls(options = {}) {
  const maxConcurrency = Math.max(Number(options.maxConcurrency || 1), 1);
  const requestsPerSecond = Math.max(Number(options.requestsPerSecond || 0), 0);
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  let activeCount = 0;
  let lastStartedAt = 0;
  const queue = [];

  async function pump() {
    if (!queue.length || activeCount >= maxConcurrency) return;

    const next = queue.shift();
    const minInterval = requestsPerSecond > 0 ? Math.ceil(1000 / requestsPerSecond) : 0;
    const elapsed = lastStartedAt ? now() - lastStartedAt : Infinity;
    if (minInterval > 0 && elapsed < minInterval) {
      await sleep(minInterval - elapsed);
    }

    activeCount += 1;
    lastStartedAt = now();

    try {
      const result = await next.task();
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      activeCount -= 1;
      if (queue.length) {
        await pump();
      }
    }
  }

  async function schedule(task) {
    if (typeof task !== 'function') {
      throw new Error('scheduled task must be a function');
    }

    return await new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      void pump();
    });
  }

  function getStatus() {
    return {
      maxConcurrency,
      requestsPerSecond,
      activeCount,
      queuedCount: queue.length,
    };
  }

  return {
    schedule,
    getStatus,
  };
}

module.exports = {
  createMtRuntimeControls,
};
