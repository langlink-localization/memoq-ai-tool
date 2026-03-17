const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMtExecutionPlan,
  buildMessagesForBatch,
  createMtRuntime,
  defaultPromptTemplates,
  formatDocumentMetadata,
  translateMtRequest,
} = require('../src/mtOrchestrator');

test('buildMtExecutionPlan splits segments by segment and character limits', () => {
  const plan = buildMtExecutionPlan({
    segments: [
      { index: 0, text: 'alpha', plainText: 'alpha' },
      { index: 1, text: 'beta', plainText: 'beta' },
      { index: 2, text: 'gamma-long', plainText: 'gamma-long' },
    ],
  }, {
    batching: {
      maxSegmentsPerBatch: 2,
      maxCharactersPerBatch: 10,
    },
  });

  assert.equal(plan.batches.length, 2);
  assert.deepEqual(plan.batches[0].segments.map((segment) => segment.index), [0, 1]);
  assert.deepEqual(plan.batches[1].segments.map((segment) => segment.index), [2]);
});

test('buildMessagesForBatch injects request type, TM, glossary, summary, and context guidance', () => {
  const messages = buildMessagesForBatch({
    sourceLanguage: 'eng',
    targetLanguage: 'zho-CN',
    requestType: 'BothFormattingAndTagsWithXml',
    metadata: {
      client: 'ACME',
      domain: 'Legal',
      subject: 'Contract',
      projectId: 'project-1',
      documentId: 'doc-1',
      segmentMetadata: [
        { segmentIndex: 1, segmentStatus: 2, segmentId: 'seg-1' },
      ],
    },
    segments: [
      { index: 0, text: 'Heading', plainText: 'Heading' },
      { index: 1, text: '<b>Hello</b>', plainText: 'Hello', tmSource: 'Hello', tmTarget: '你好' },
      { index: 2, text: 'Footer', plainText: 'Footer' },
    ],
  }, {
    segments: [
      { index: 1, text: '<b>Hello</b>', plainText: 'Hello', tmSource: 'Hello', tmTarget: '你好' },
    ],
    batchIndex: 0,
  }, {
    requestTypePolicy: {
      insertRequiredTagsToEnd: true,
      normalizeWhitespaceAroundTags: true,
    },
    prompts: {
      systemPrompt: 'System {{request-type}} {{glossary-text}} {{document-metadata}}',
      userPrompt: 'Translate {{source-language}} -> {{target-language}} :: {{source-text}} :: {{tm-text}} :: {{summary-text}} :: {{context-text}}',
      batchSystemPrompt: 'Batch {{request-type}} {{document-metadata}}',
      batchUserPrompt: 'Batch {{source-text}} :: {{tm-text}} :: {{summary-text}} :: {{context-text}}',
      useBatchPromptForMultiSegment: true,
    },
    glossary: {
      enabled: true,
      entriesText: 'Hello,你好\nWorld,世界',
    },
    summary: {
      enabled: true,
      text: 'Document summary',
    },
    context: {
      enabled: true,
      includeSource: true,
      windowBefore: 1,
      windowAfter: 1,
    },
    tm: {
      enabled: true,
    },
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /System BothFormattingAndTagsWithXml/);
  assert.match(messages[0].content, /Hello,你好/);
  assert.match(messages[0].content, /Client: ACME/);
  assert.match(messages[0].content, /Domain: Legal/);
  assert.match(messages[0].content, /Subject: Contract/);
  assert.match(messages[0].content, /index=1, status=2, segmentId=seg-1/);
  assert.match(messages[1].content, /Document summary/);
  assert.match(messages[1].content, /Heading/);
  assert.match(messages[1].content, /Footer/);
  assert.match(messages[1].content, /Hello => 你好/);
});

test('formatDocumentMetadata narrows memoQ segment metadata to the current batch', () => {
  const text = formatDocumentMetadata({
    metadata: {
      client: 'ACME',
      domain: 'Legal',
      subject: 'Contract',
      projectId: 'project-1',
      documentId: 'doc-1',
      segmentMetadata: [
        { segmentIndex: 0, segmentStatus: 1, segmentId: 'seg-0' },
        { segmentIndex: 2, segmentStatus: 2, segmentId: 'seg-2' },
      ],
    },
  }, {
    segments: [
      { index: 2, text: 'hello' },
    ],
  });

  assert.match(text, /Client: ACME/);
  assert.match(text, /Domain: Legal/);
  assert.match(text, /Subject: Contract/);
  assert.match(text, /Project ID: project-1/);
  assert.match(text, /Document ID: doc-1/);
  assert.match(text, /index=2, status=2, segmentId=seg-2/);
  assert.doesNotMatch(text, /index=0/);
});

test('translateMtRequest retries failed batches and serves identical requests from cache', async () => {
  const runtime = createMtRuntime();
  const attempts = [];
  const payload = {
    sourceLanguage: 'eng',
    targetLanguage: 'zho-CN',
    requestType: 'Plaintext',
    segments: [
      { index: 0, text: 'Hello', plainText: 'Hello' },
      { index: 1, text: 'World', plainText: 'World' },
    ],
  };

  let shouldFail = true;
  const translateBatch = async (request) => {
    attempts.push(request.segments.map((segment) => segment.index).join(','));
    if (shouldFail) {
      shouldFail = false;
      throw new Error('temporary upstream failure');
    }
    return request.segments.map((segment) => `${segment.text}-translated`);
  };

  const config = {
    batching: {
      maxSegmentsPerBatch: 2,
      maxCharactersPerBatch: 0,
    },
    retry: {
      enabled: true,
      maxAttempts: 2,
      backoffMs: 0,
    },
    cache: {
      enabled: true,
    },
    prompts: {},
    requestTypePolicy: {},
    context: { enabled: false },
    glossary: { enabled: false },
    summary: { enabled: false },
    tm: { enabled: false },
  };

  const first = await translateMtRequest(payload, config, {
    runtime,
    translateBatch,
  });
  const second = await translateMtRequest(payload, config, {
    runtime,
    translateBatch,
  });

  assert.deepEqual(first.translations, ['Hello-translated', 'World-translated']);
  assert.deepEqual(second.translations, ['Hello-translated', 'World-translated']);
  assert.equal(attempts.length, 2);
});

test('translateMtRequest enforces request timeout and aborts the in-flight batch', async () => {
  const payload = {
    sourceLanguage: 'eng',
    targetLanguage: 'zho-CN',
    requestType: 'Plaintext',
    segments: [
      { index: 0, text: 'Hello', plainText: 'Hello' },
    ],
  };

  let aborted = false;

  await assert.rejects(
    () => translateMtRequest(payload, {
      batching: {
        maxSegmentsPerBatch: 1,
      },
      retry: {
        enabled: false,
      },
      prompts: {},
      requestTypePolicy: {},
      context: { enabled: false },
      glossary: { enabled: false },
      summary: { enabled: false },
      tm: { enabled: false },
    }, {
      requestTimeoutMs: 5,
      translateBatch: ({ abortSignal }) => new Promise((resolve, reject) => {
        abortSignal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        }, { once: true });
      }),
    }),
    (error) => error?.interfaceCode === 'TRANSLATION_TIMEOUT'
  );

  assert.equal(aborted, true);
});

test('defaultPromptTemplates require JSON output for single-segment translations', () => {
  const [template] = defaultPromptTemplates();

  assert.match(template.systemPrompt, /Return valid JSON only/i);
  assert.match(template.userPrompt, /"translations"/);
});
