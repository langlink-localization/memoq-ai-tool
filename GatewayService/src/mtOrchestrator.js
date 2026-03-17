const crypto = require('crypto');

function defaultPromptTemplates() {
  return [
    {
      id: 'default',
      name: 'Default CAT Prompt',
      systemPrompt: 'You are a professional translator using CAT tools. Return valid JSON only. Preserve inline tags and formatting markers exactly as-is. Request type: {{request-type}}. {{formatting-instruction}} {{glossary-text}} {{document-metadata}}',
      userPrompt: 'Translate from {{source-language}} to {{target-language}} and return {"translations":["..."]}.\nSource:\n{{source-text}}\n{{tm-text}}\n{{summary-text}}\n{{context-text}}',
      batchSystemPrompt: 'You are a professional translator using CAT tools. Return valid JSON only. Preserve inline tags and formatting markers exactly as-is. Request type: {{request-type}}. {{formatting-instruction}} {{glossary-text}} {{document-metadata}}',
      batchUserPrompt: 'Translate from {{source-language}} to {{target-language}} and return {"translations":["..."]}.\nSource JSON:\n{{source-text}}\n{{tm-text}}\n{{summary-text}}\n{{context-text}}',
    },
  ];
}

function defaultMtAdvancedConfig(baseMtConfig = {}) {
  const maxBatchSegments = Math.max(Number(baseMtConfig?.maxBatchSegments || 8), 1);
  return {
    requestTypePolicy: {
      insertRequiredTagsToEnd: false,
      normalizeWhitespaceAroundTags: false,
    },
    batching: {
      maxSegmentsPerBatch: maxBatchSegments,
      maxCharactersPerBatch: 0,
      useBatchPromptForMultiSegment: true,
    },
    retry: {
      enabled: true,
      maxAttempts: 2,
      backoffMs: 150,
    },
    cache: {
      enabled: false,
    },
    prompts: {
      activeTemplateId: 'default',
      systemPrompt: '',
      userPrompt: '',
      batchSystemPrompt: '',
      batchUserPrompt: '',
      useBatchPromptForMultiSegment: true,
      templates: defaultPromptTemplates(),
    },
    glossary: {
      enabled: false,
      delimiter: ',',
      entriesText: '',
    },
    summary: {
      enabled: false,
      text: '',
    },
    context: {
      enabled: false,
      includeSource: true,
      windowBefore: 1,
      windowAfter: 1,
    },
    tm: {
      enabled: true,
    },
    runtime: {
      maxConcurrency: 1,
      requestsPerSecond: 0,
    },
  };
}

function mergeObjects(base, patch) {
  if (!patch || typeof patch !== 'object') return { ...base };
  const result = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = value.slice();
    } else if (value && typeof value === 'object') {
      result[key] = mergeObjects(base?.[key] && typeof base[key] === 'object' ? base[key] : {}, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  });
  return result;
}

function normalizeAdvancedConfig(advancedConfig, baseMtConfig = {}) {
  const defaults = defaultMtAdvancedConfig(baseMtConfig);
  const merged = mergeObjects(defaults, advancedConfig || {});
  const templateList = Array.isArray(merged.prompts?.templates) && merged.prompts.templates.length
    ? merged.prompts.templates
    : defaults.prompts.templates;

  merged.batching.maxSegmentsPerBatch = Math.max(Number(merged.batching?.maxSegmentsPerBatch || defaults.batching.maxSegmentsPerBatch), 1);
  merged.batching.maxCharactersPerBatch = Math.max(Number(merged.batching?.maxCharactersPerBatch || 0), 0);
  merged.retry.maxAttempts = Math.max(Number(merged.retry?.maxAttempts || defaults.retry.maxAttempts), 1);
  merged.retry.backoffMs = Math.max(Number(merged.retry?.backoffMs || defaults.retry.backoffMs), 0);
  merged.context.windowBefore = Math.max(Number(merged.context?.windowBefore || 0), 0);
  merged.context.windowAfter = Math.max(Number(merged.context?.windowAfter || 0), 0);
  merged.runtime.maxConcurrency = Math.max(Number(merged.runtime?.maxConcurrency || defaults.runtime.maxConcurrency), 1);
  merged.runtime.requestsPerSecond = Math.max(Number(merged.runtime?.requestsPerSecond || defaults.runtime.requestsPerSecond), 0);
  merged.prompts.templates = templateList.map((template, index) => ({
    id: String(template?.id || `template-${index + 1}`).trim(),
    name: String(template?.name || `Template ${index + 1}`).trim(),
    systemPrompt: String(template?.systemPrompt || ''),
    userPrompt: String(template?.userPrompt || ''),
    batchSystemPrompt: String(template?.batchSystemPrompt || ''),
    batchUserPrompt: String(template?.batchUserPrompt || ''),
  }));
  if (!merged.prompts.activeTemplateId || !merged.prompts.templates.some((template) => template.id === merged.prompts.activeTemplateId)) {
    merged.prompts.activeTemplateId = merged.prompts.templates[0]?.id || 'default';
  }
  return merged;
}

function buildMtExecutionPlan(payload, advancedConfig) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const maxSegments = Math.max(Number(advancedConfig?.batching?.maxSegmentsPerBatch || segments.length || 1), 1);
  const maxCharacters = Math.max(Number(advancedConfig?.batching?.maxCharactersPerBatch || 0), 0);
  const batches = [];
  let start = 0;

  while (start < segments.length) {
    let count = 0;
    let charCount = 0;
    for (let index = start; index < segments.length; index += 1) {
      const text = String(segments[index]?.text || '');
      const nextLength = text.length;
      const wouldExceedSegments = count >= maxSegments;
      const wouldExceedChars = maxCharacters > 0 && count > 0 && (charCount + nextLength) > maxCharacters;
      if (wouldExceedSegments || wouldExceedChars) break;
      count += 1;
      charCount += nextLength;
    }
    const batchSegments = segments.slice(start, start + Math.max(count, 1));
    batches.push({
      batchIndex: batches.length,
      startIndex: start,
      segments: batchSegments,
    });
    start += batchSegments.length;
  }

  return { batches };
}

function resolvePromptTemplate(advancedConfig, batchSize) {
  const prompts = advancedConfig?.prompts || {};
  const template = (prompts.templates || []).find((item) => item.id === prompts.activeTemplateId) || (prompts.templates || [])[0] || {};
  const useBatchPrompt = batchSize > 1 && prompts.useBatchPromptForMultiSegment !== false;

  return {
    systemPrompt: String((useBatchPrompt ? prompts.batchSystemPrompt : prompts.systemPrompt) || (useBatchPrompt ? template.batchSystemPrompt : template.systemPrompt) || ''),
    userPrompt: String((useBatchPrompt ? prompts.batchUserPrompt : prompts.userPrompt) || (useBatchPrompt ? template.batchUserPrompt : template.userPrompt) || ''),
  };
}

function formatGlossary(advancedConfig) {
  if (!advancedConfig?.glossary?.enabled) return '';
  const delimiter = String(advancedConfig.glossary.delimiter || ',');
  const rows = String(advancedConfig.glossary.entriesText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(delimiter).map((item) => item.trim()).filter(Boolean))
    .filter((parts) => parts.length >= 2)
    .map((parts) => `${parts[0]},${parts[1]}`);
  return rows.length ? `Glossary:\n${rows.join('\n')}` : '';
}

function formatSummary(advancedConfig) {
  if (!advancedConfig?.summary?.enabled) return '';
  const text = String(advancedConfig.summary.text || '').trim();
  return text ? `Summary:\n${text}` : '';
}

function formatTm(batch, advancedConfig) {
  if (!advancedConfig?.tm?.enabled) return '';
  const rows = (batch?.segments || [])
    .map((segment) => {
      const source = String(segment?.tmSource || '').trim();
      const target = String(segment?.tmTarget || '').trim();
      return source && target ? `${source} => ${target}` : '';
    })
    .filter(Boolean);
  return rows.length ? `TM:\n${rows.join('\n')}` : '';
}

function formatContext(payload, batch, advancedConfig) {
  if (!advancedConfig?.context?.enabled) return '';
  const allSegments = Array.isArray(payload?.segments) ? payload.segments : [];
  const includeSource = advancedConfig.context.includeSource !== false;
  const before = Math.max(Number(advancedConfig.context.windowBefore || 0), 0);
  const after = Math.max(Number(advancedConfig.context.windowAfter || 0), 0);
  const indices = new Set((batch?.segments || []).map((segment) => Number(segment?.index)));
  const currentMin = Math.min(...Array.from(indices));
  const currentMax = Math.max(...Array.from(indices));
  const lines = [];

  allSegments.forEach((segment, arrayIndex) => {
    const index = Number.isFinite(segment?.index) ? segment.index : arrayIndex;
    if ((index >= currentMin - before && index < currentMin) || (index > currentMax && index <= currentMax + after)) {
      lines.push(includeSource ? String(segment?.plainText || segment?.text || '') : String(segment?.text || ''));
    }
  });

  return lines.length ? `Context:\n${lines.join('\n')}` : '';
}

function buildFormattingInstruction(payload, advancedConfig) {
  const requestType = String(payload?.requestType || 'Plaintext');
  const extra = [];
  if (/xml/i.test(requestType)) extra.push('Preserve XML tags and formatting.');
  if (/html/i.test(requestType)) extra.push('Preserve HTML tags and formatting.');
  if (/tags/i.test(requestType)) extra.push('Keep tags in valid positions and do not drop required tags.');
  if (advancedConfig?.requestTypePolicy?.insertRequiredTagsToEnd) extra.push('If a required tag cannot remain in place, append it to the end instead of dropping it.');
  if (advancedConfig?.requestTypePolicy?.normalizeWhitespaceAroundTags) extra.push('Normalize stray whitespace around tags without changing human-readable spacing.');
  return extra.join(' ');
}

function buildSegmentSource(batchSegments, useBatchPrompt) {
  if (useBatchPrompt) {
    return JSON.stringify(batchSegments.map((segment, index) => ({
      index: Number.isFinite(segment?.index) ? segment.index : index,
      text: String(segment?.text || ''),
    })));
  }
  return String(batchSegments[0]?.text || '');
}

function formatDocumentMetadata(payload, batch) {
  const metadata = payload?.metadata || {};
  const lines = [];

  if (metadata?.client) lines.push(`Client: ${String(metadata.client).trim()}`);
  if (metadata?.domain) lines.push(`Domain: ${String(metadata.domain).trim()}`);
  if (metadata?.subject) lines.push(`Subject: ${String(metadata.subject).trim()}`);
  if (metadata?.projectId) lines.push(`Project ID: ${String(metadata.projectId).trim()}`);
  if (metadata?.documentId) lines.push(`Document ID: ${String(metadata.documentId).trim()}`);

  const batchIndices = new Set((batch?.segments || []).map((segment, index) => (
    Number.isFinite(segment?.index) ? Number(segment.index) : index
  )));
  const segmentMetadata = Array.isArray(metadata?.segmentMetadata) ? metadata.segmentMetadata : [];
  const segmentLines = segmentMetadata
    .filter((item) => batchIndices.has(Number(item?.segmentIndex)))
    .map((item) => {
      const parts = [`index=${Number(item.segmentIndex)}`];
      if (item?.segmentStatus !== undefined && item?.segmentStatus !== null) {
        parts.push(`status=${Number(item.segmentStatus)}`);
      }
      if (item?.segmentId) {
        parts.push(`segmentId=${String(item.segmentId)}`);
      }
      return parts.join(', ');
    });

  if (segmentLines.length) {
    lines.push(`Segment metadata:\n${segmentLines.join('\n')}`);
  }

  return lines.length ? `Document metadata:\n${lines.join('\n')}` : '';
}

function replacePlaceholders(template, values) {
  return String(template || '').replace(/\{\{([a-z-]+)\}\}/gi, (match, key) => {
    const normalized = String(key || '').trim().toLowerCase();
    return values[normalized] ?? '';
  });
}

function buildMessagesForBatch(payload, batch, advancedConfig) {
  const useBatchPrompt = (batch?.segments?.length || 0) > 1 && advancedConfig?.prompts?.useBatchPromptForMultiSegment !== false;
  const resolvedPrompts = resolvePromptTemplate(advancedConfig, batch?.segments?.length || 0);
  const glossaryText = formatGlossary(advancedConfig);
  const summaryText = formatSummary(advancedConfig);
  const tmText = formatTm(batch, advancedConfig);
  const contextText = formatContext(payload, batch, advancedConfig);
  const formattingInstruction = buildFormattingInstruction(payload, advancedConfig);
  const documentMetadataText = formatDocumentMetadata(payload, batch);
  const replacements = {
    'request-type': String(payload?.requestType || 'Plaintext'),
    'source-language': String(payload?.sourceLanguage || ''),
    'target-language': String(payload?.targetLanguage || ''),
    'source-text': buildSegmentSource(batch?.segments || [], useBatchPrompt),
    'glossary-text': glossaryText,
    'summary-text': summaryText,
    'tm-text': tmText,
    'context-text': contextText,
    'formatting-instruction': formattingInstruction,
    'document-metadata': documentMetadataText,
  };

  return [
    {
      role: 'system',
      content: replacePlaceholders(resolvedPrompts.systemPrompt, replacements).trim(),
    },
    {
      role: 'user',
      content: replacePlaceholders(resolvedPrompts.userPrompt, replacements).trim(),
    },
  ];
}

function createMtRuntime() {
  return {
    cache: new Map(),
  };
}

function createTranslationTimeoutError(timeoutMs) {
  const error = new Error(`translation request timed out after ${timeoutMs}ms`);
  error.code = 'TRANSLATION_TIMEOUT';
  error.interfaceCode = 'TRANSLATION_TIMEOUT';
  return error;
}

function cacheKeyForRequest(payload, advancedConfig) {
  const digest = crypto.createHash('sha1');
  digest.update(JSON.stringify({
    sourceLanguage: payload?.sourceLanguage,
    targetLanguage: payload?.targetLanguage,
    requestType: payload?.requestType,
    providerId: payload?.providerId,
    model: payload?.model,
    segments: payload?.segments,
    advancedConfig,
  }));
  return digest.digest('hex');
}

async function delay(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWithTimeout(task, timeoutMs) {
  const normalizedTimeout = Math.max(Number(timeoutMs || 0), 0);
  if (!normalizedTimeout) {
    return task({});
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (controller) controller.abort();
      reject(createTranslationTimeoutError(normalizedTimeout));
    }, normalizedTimeout);

    Promise.resolve(task({ abortSignal: controller?.signal || null }))
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function translateMtRequest(payload, advancedConfig, options) {
  const runtime = options?.runtime || createMtRuntime();
  const translateBatch = options?.translateBatch;
  if (typeof translateBatch !== 'function') {
    throw new Error('translateBatch must be provided');
  }

  const normalizedAdvancedConfig = normalizeAdvancedConfig(advancedConfig, {
    maxBatchSegments: advancedConfig?.batching?.maxSegmentsPerBatch || advancedConfig?.maxBatchSegments,
  });
  const requestTimeoutMs = Math.max(Number(options?.requestTimeoutMs || payload?.requestTimeoutMs || 0), 0);
  const plan = buildMtExecutionPlan(payload, normalizedAdvancedConfig);
  const cacheKey = cacheKeyForRequest(payload, normalizedAdvancedConfig);

  if (normalizedAdvancedConfig.cache?.enabled && runtime.cache.has(cacheKey)) {
    return {
      translations: runtime.cache.get(cacheKey).slice(),
      batches: plan.batches.length,
      cacheHit: true,
    };
  }

  const translations = [];
  for (const batch of plan.batches) {
    const messages = buildMessagesForBatch(payload, batch, normalizedAdvancedConfig);
    const attempts = normalizedAdvancedConfig.retry?.enabled !== false
      ? Math.max(Number(normalizedAdvancedConfig.retry?.maxAttempts || 1), 1)
      : 1;
    let result = null;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        result = await executeWithTimeout(async ({ abortSignal }) => translateBatch({
          ...payload,
          abortSignal,
          segments: batch.segments,
          orchestration: {
            batchIndex: batch.batchIndex,
            totalBatches: plan.batches.length,
            messages,
            useBatchPrompt: batch.segments.length > 1 && normalizedAdvancedConfig.prompts?.useBatchPromptForMultiSegment !== false,
            requestType: payload?.requestType,
          },
        }), requestTimeoutMs);
        break;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) throw error;
        await delay(Number(normalizedAdvancedConfig.retry?.backoffMs || 0));
      }
    }

    if (!Array.isArray(result) || result.length !== batch.segments.length) {
      throw lastError || new Error('orchestrator received invalid batch translation result');
    }
    translations.push(...result);
  }

  if (normalizedAdvancedConfig.cache?.enabled) {
    runtime.cache.set(cacheKey, translations.slice());
  }

  return {
    translations,
    batches: plan.batches.length,
    cacheHit: false,
  };
}

module.exports = {
  buildMessagesForBatch,
  buildMtExecutionPlan,
  createMtRuntime,
  defaultMtAdvancedConfig,
  defaultPromptTemplates,
  formatDocumentMetadata,
  normalizeAdvancedConfig,
  translateMtRequest,
};
