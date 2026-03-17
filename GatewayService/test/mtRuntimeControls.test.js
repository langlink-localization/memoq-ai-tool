const test = require('node:test');
const assert = require('node:assert/strict');

const { createMtRuntimeControls } = require('../src/mtRuntimeControls');

test('createMtRuntimeControls serializes work when maxConcurrency is 1', async () => {
  const order = [];
  const controls = createMtRuntimeControls({
    maxConcurrency: 1,
    requestsPerSecond: 0,
    sleep: async () => {},
    now: () => 0,
  });

  await Promise.all([
    controls.schedule(async () => {
      order.push('task1-start');
      await Promise.resolve();
      order.push('task1-end');
      return 'task1';
    }),
    controls.schedule(async () => {
      order.push('task2-start');
      order.push('task2-end');
      return 'task2';
    }),
  ]);

  assert.deepEqual(order, ['task1-start', 'task1-end', 'task2-start', 'task2-end']);
});

test('createMtRuntimeControls waits between starts when requestsPerSecond is limited', async () => {
  let currentTime = 1000;
  const sleeps = [];
  const controls = createMtRuntimeControls({
    maxConcurrency: 1,
    requestsPerSecond: 2,
    now: () => currentTime,
    sleep: async (ms) => {
      sleeps.push(ms);
      currentTime += ms;
    },
  });

  await controls.schedule(async () => 'first');
  await controls.schedule(async () => 'second');

  assert.deepEqual(sleeps, [500]);
});
