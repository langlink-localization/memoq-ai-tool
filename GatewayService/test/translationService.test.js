const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTranslationsFromResponse } = require('../src/translationService');

test('parseTranslationsFromResponse rejects conversational single-segment replies for orchestrated requests', () => {
  assert.throws(
    () => parseTranslationsFromResponse('Hi — how can I help you today?', 1, {
      orchestration: {
        batchIndex: 0,
        totalBatches: 1,
      },
    }),
    /missing translations array/i
  );
});

test('parseTranslationsFromResponse still allows legacy plaintext single-segment replies without orchestration', () => {
  assert.deepEqual(
    parseTranslationsFromResponse('你好，世界', 1),
    ['你好，世界']
  );
});

test('parseTranslationsFromResponse accepts JSON translations for orchestrated single-segment replies', () => {
  assert.deepEqual(
    parseTranslationsFromResponse('{"translations":["你好，世界"]}', 1, {
      orchestration: {
        batchIndex: 0,
        totalBatches: 1,
      },
    }),
    ['你好，世界']
  );
});
