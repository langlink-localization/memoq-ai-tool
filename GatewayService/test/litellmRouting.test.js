const test = require('node:test');
const assert = require('node:assert/strict');

const { buildChatCompletionPayload, normalizeTranslations, translateWithLiteLLMProxy } = require('../src/translationService');

test('buildChatCompletionPayload omits temperature for GPT-5 family models only', () => {
  const gpt5Payload = buildChatCompletionPayload(
    { model: 'gpt-5-mini' },
    {},
    [{ role: 'user', content: 'hello' }]
  );
  const gpt4Payload = buildChatCompletionPayload(
    { model: 'gpt-4.1-mini' },
    {},
    [{ role: 'user', content: 'hello' }]
  );

  assert.equal('temperature' in gpt5Payload, false);
  assert.equal(gpt4Payload.temperature, 0.2);
});

test('buildChatCompletionPayload omits temperature for GPT-5 provider aliases routed through LiteLLM', () => {
  const payload = buildChatCompletionPayload(
    { model: 'openai-gpt-5-mini' },
    { id: 'openai-gpt-5-mini', model: 'gpt-5-mini' },
    [{ role: 'user', content: 'hello' }],
    'openai-gpt-5-mini'
  );

  assert.equal(payload.model, 'openai-gpt-5-mini');
  assert.equal('temperature' in payload, false);
});

test('translateWithLiteLLMProxy sends requests to the local LiteLLM proxy using provider id as model alias', async () => {
  const originalFetch = global.fetch;
  const controller = new AbortController();
  let capturedUrl = '';
  let capturedBody = null;
  let capturedSignal = null;

  global.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(options.body);
    capturedSignal = options.signal;
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ translations: ['translated-text'] }),
              },
            },
          ],
        });
      },
    };
  };

  try {
    const result = await translateWithLiteLLMProxy(
      {
        sourceLanguage: 'eng',
        targetLanguage: 'zho-CN',
        abortSignal: controller.signal,
        segments: [{ index: 0, text: 'source-text' }],
      },
      {
        id: 'openrouter-main',
        model: 'openai/gpt-4.1-mini',
      },
      {
        host: '127.0.0.1',
        port: 4000,
      }
    );

    assert.equal(capturedUrl, 'http://127.0.0.1:4000/v1/chat/completions');
    assert.equal(capturedSignal, controller.signal);
    assert.equal(capturedBody.model, 'openrouter-main');
    assert.equal('temperature' in capturedBody, true);
    assert.deepEqual(result, ['translated-text']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('normalizeTranslations trims stray whitespace and appends missing closing tags when configured', () => {
  const result = normalizeTranslations(
    [
      '  hello world  ',
      '<b>bold text',
    ],
    {
      requestType: 'BothFormattingAndTagsWithXml',
      advancedConfig: {
        requestTypePolicy: {
          insertRequiredTagsToEnd: true,
          normalizeWhitespaceAroundTags: true,
        },
      },
      segments: [
        { text: 'hello world' },
        { text: '<b>bold text</b>' },
      ],
    }
  );

  assert.deepEqual(result, [
    'hello world',
    '<b>bold text</b>',
  ]);
});
