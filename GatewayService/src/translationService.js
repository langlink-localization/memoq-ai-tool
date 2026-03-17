const crypto = require('crypto');

const OPENAI_COMPATIBLE_TYPES = ['openai', 'openai-compatible', 'openai_compatible', 'mock'];

function normalizeSegment(segment, fallbackIndex = 0) {
  return {
    index: Number.isFinite(segment?.index) ? segment.index : fallbackIndex,
    text: String(segment?.text || ''),
    plainText: String(segment?.plainText || ''),
    tmSource: String(segment?.tmSource || ''),
    tmTarget: String(segment?.tmTarget || ''),
  };
}

function sha1Hex(value) {
  return crypto.createHash('sha1').update(value || '').digest('hex');
}

function translateWithMock(request) {
  const segments = Array.isArray(request?.segments) ? request.segments : [];
  const provider = String(request?.providerId || 'default');
  const model = String(request?.model || '');

  return segments.map((segment, idx) => {
    const item = normalizeSegment(segment, idx);
    const original = item.text.trim();
    if (!original) return '';

    const providerTag = provider || 'default';
    const modelTag = model ? `/${model}` : '';
    return `[gateway-mock:${providerTag}${modelTag}] ${original}`;
  });
}

function resolvedModelName(request, provider) {
  return String(request?.model || provider?.model || '').trim();
}

function isGpt5FamilyModel(model) {
  const value = String(model || '').trim().toLowerCase();
  return value.startsWith('gpt-5');
}

function buildChatCompletionPayload(request, provider, messages, modelOverride) {
  const model = String(modelOverride || resolvedModelName(request, provider)).trim();
  const compatibilityModel = String(provider?.model || request?.model || model).trim();
  const payload = {
    model,
    messages,
  };

  if (!isGpt5FamilyModel(compatibilityModel)) {
    payload.temperature = 0.2;
  }

  return payload;
}

function messagesForRequest(request, provider) {
  if (Array.isArray(request?.orchestration?.messages) && request.orchestration.messages.length) {
    return request.orchestration.messages;
  }

  const sourceLanguage = String(request?.sourceLanguage || '').trim();
  const targetLanguage = String(request?.targetLanguage || '').trim();
  const segments = Array.isArray(request?.segments) ? request.segments : [];
  const promptSegments = segments.map((segment, index) => ({
    index: Number.isFinite(segment?.index) ? segment.index : index,
    text: String(segment?.text || ''),
  }));

  return [
    {
      role: 'system',
      content: [
        'You are an API translator for computer-assisted translation.',
        `Translate each segment from ${sourceLanguage || 'source'} to ${targetLanguage || 'target'}.`,
        'Return ONLY valid JSON with this shape:',
        '{"translations":["...","..."]}',
        'Do not add extra text, markdown, explanations, or comments.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        model: resolvedModelName(request, provider),
        segments: promptSegments,
        instruction: 'Preserve placeholders and inline formatting tags in the text exactly as-is.',
      }),
    },
  ];
}

function parseTranslationsFromResponse(translatedText, expectedCount, request = {}) {
  const normalized = String(translatedText || '').trim();
  if (!normalized) {
    throw new Error('provider returned missing translated text');
  }

  try {
    if (normalized.startsWith('{')) {
      const payload = JSON.parse(normalized);
      if (Array.isArray(payload.translations)) {
        if (payload.translations.length !== expectedCount) {
          throw new Error('provider returned unexpected translation count');
        }
        return payload.translations.map((item) => String(item || ''));
      }
    }
  } catch (error) {
    throw new Error(`cannot parse openai-compatible provider response: ${error.message}`);
  }

  const allowLegacyPlaintext = expectedCount === 1 && !request?.orchestration;
  if (allowLegacyPlaintext) {
    return [normalized];
  }

  throw new Error('missing translations array in provider response');
}

function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+(<\/[^>]+>)/g, '$1').replace(/(>)[ \t]+/g, '$1');
}

function appendMissingClosingTags(text, sourceText) {
  const result = String(text || '');
  const source = String(sourceText || '');
  const openingTags = Array.from(source.matchAll(/<([a-zA-Z][a-zA-Z0-9:_-]*)\b[^>]*>/g)).map((match) => match[1]);
  let normalized = result;

  openingTags.forEach((tag) => {
    const openCount = (normalized.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) || []).length;
    const closeCount = (normalized.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (openCount > closeCount) {
      normalized = `${normalized}</${tag}>`;
    }
  });

  return normalized;
}

function normalizeTranslations(translations, request = {}) {
  const advancedConfig = request?.advancedConfig || {};
  const requestType = String(request?.requestType || '');
  const normalizeSpaces = !!advancedConfig?.requestTypePolicy?.normalizeWhitespaceAroundTags;
  const appendTags = !!advancedConfig?.requestTypePolicy?.insertRequiredTagsToEnd
    && /xml|html|tags/i.test(requestType);
  const sourceSegments = Array.isArray(request?.segments) ? request.segments : [];

  return (Array.isArray(translations) ? translations : []).map((translation, index) => {
    let value = String(translation || '');
    if (normalizeSpaces) {
      value = normalizeWhitespace(value);
    }
    if (appendTags) {
      value = appendMissingClosingTags(value, sourceSegments[index]?.text || '');
    }
    return value;
  });
}

async function translateWithOpenAICompatible(request, provider, apiKey) {
  const endpoint = String(provider?.endpoint || 'https://api.openai.com/v1/chat/completions').trim();
  if (!endpoint) throw new Error('provider endpoint is missing');
  if (!apiKey) throw new Error('provider api key is missing');

  const segments = Array.isArray(request?.segments) ? request.segments : [];
  const messages = messagesForRequest(request, provider);

  const baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  const chatUrl = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const resp = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildChatCompletionPayload(request, provider, messages)),
    signal: request?.abortSignal || undefined,
  });

  const responseText = await resp.text();
  if (!resp.ok) {
    throw new Error(`openai-compatible provider request failed (${resp.status}): ${responseText}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`invalid JSON response from openai-compatible provider: ${error.message}`);
  }

  const translatedText = parsed?.choices?.[0]?.message?.content;
  if (typeof translatedText !== 'string' || !translatedText.trim()) {
    throw new Error('openai-compatible provider returned missing translated text');
  }

  return parseTranslationsFromResponse(translatedText, segments.length, request);
}

async function translateWithLiteLLMProxy(request, provider, litellmConfig) {
  const host = String(litellmConfig?.host || '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(litellmConfig?.port || 4000);
  const segments = Array.isArray(request?.segments) ? request.segments : [];

  const messages = messagesForRequest(request, provider);

  const resp = await fetch(`http://${host}:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildChatCompletionPayload(request, provider, messages, String(provider?.id || '').trim())),
    signal: request?.abortSignal || undefined,
  });

  const responseText = await resp.text();
  if (!resp.ok) {
    throw new Error(`LiteLLM proxy request failed (${resp.status}): ${responseText}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`invalid JSON response from LiteLLM proxy: ${error.message}`);
  }

  const translatedText = parsed?.choices?.[0]?.message?.content;
  if (typeof translatedText !== 'string' || !translatedText.trim()) {
    throw new Error('LiteLLM proxy returned missing translated text');
  }

  return parseTranslationsFromResponse(translatedText, segments.length, request);
}

function shouldUseLiteLLM(provider, litellmConfig) {
  const type = String(provider?.type || '').toLowerCase();
  return Boolean(litellmConfig?.enabled)
    && (type === 'openai' || type === 'openai-compatible' || type === 'openai_compatible');
}

async function translateWithProvider(request, provider, apiKey = '', runtimeConfig = {}) {
  const type = String(provider?.type || 'mock').toLowerCase();
  let translations;
  if (type === 'mock') {
    translations = translateWithMock(request);
    return normalizeTranslations(translations, request);
  }
  if (shouldUseLiteLLM(provider, runtimeConfig?.litellm)) {
    translations = await translateWithLiteLLMProxy(request, provider, runtimeConfig.litellm);
    return normalizeTranslations(translations, request);
  }
  if (!OPENAI_COMPATIBLE_TYPES.includes(type)) {
    throw new Error(`unsupported provider type: ${type}`);
  }
  translations = await translateWithOpenAICompatible(request, provider, apiKey);
  return normalizeTranslations(translations, request);
}

function tmLookup(request) {
  const first = normalizeSegment((Array.isArray(request?.segments) && request.segments[0]) || {}, 0);
  if (!first.text) return [];

  return [
    {
      providerId: String(request?.providerId || 'mock-llm'),
      model: String(request?.model || ''),
      source: first.text,
      target: first.plainText || first.text,
      score: 100,
      sourceLang: request.sourceLanguage,
      targetLang: request.targetLanguage,
      context: 'local-mock',
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      metadata: {
        segmentIndex: first.index,
      },
    },
  ];
}

function tbLookup(request) {
  const term = normalizeSegment((Array.isArray(request?.segments) && request.segments[0]) || {}, 0);
  const source = term.text;
  if (!source) return [];

  return [
    {
      providerId: String(request?.providerId || 'mock-llm'),
      model: String(request?.model || ''),
      sourceTerm: source,
      targetTerm: source,
      sourceLang: request.sourceLanguage,
      targetLang: request.targetLanguage,
      externalId: `mock-${sha1Hex(source).slice(0, 12)}`,
      matchType: 'exact',
      score: 1,
      metadata: {
        segmentIndex: term.index,
      },
    },
  ];
}

function qaCheck(request) {
  const issues = [];
  const bad = ['TODO', 'FIXME', 'XXX'];
  const segments = Array.isArray(request?.segments) ? request.segments : [];

    segments.forEach((segment, index) => {
    const item = normalizeSegment(segment, index);
    bad.forEach((keyword) => {
      if (item.text.includes(keyword)) {
        issues.push({
          providerId: String(request?.providerId || 'mock-llm'),
          model: String(request?.model || ''),
          segmentIndex: index,
          code: 'STYLE-KEYWORD',
          message: `Detected forbidden keyword "${keyword}"`,
          severity: 'warning',
          source: item.text,
          metadata: {
            segmentIndex: item.index,
          },
        });
      }
    });
  });

  return issues;
}

module.exports = {
  buildChatCompletionPayload,
  normalizeTranslations,
  parseTranslationsFromResponse,
  translateWithMock,
  translateWithLiteLLMProxy,
  translateWithProvider,
  shouldUseLiteLLM,
  tmLookup,
  tbLookup,
  qaCheck,
};
