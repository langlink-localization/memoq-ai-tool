export function createEmptyProvider() {
  return {
    id: '',
    name: '',
    type: 'openai',
    endpoint: '',
    model: '',
    enabled: true,
    apiKey: '',
  };
}

export function createDefaultConfigForm() {
  return {
    mtEnabled: true,
    tmEnabled: false,
    tbEnabled: false,
    qaEnabled: false,
    mtTimeout: 120000,
    mtBatch: 8,
    host: '127.0.0.1',
    port: 5271,
    retentionDays: 30,
    maskSensitive: true,
    hashTextForLog: true,
    storeRawPayload: true,
    memoqVersion: '11',
    memoqCustomInstallDir: '',
    liteLLMEnabled: false,
    liteLLMHost: '127.0.0.1',
    liteLLMPort: 4000,
    liteLLMCli: '',
    liteLLMPython: 'python3',
    mtDefaultProvider: '',
    advBatchSegments: 8,
    advBatchChars: 0,
    advRetryAttempts: 2,
    advRetryBackoff: 150,
    advContextBefore: 1,
    advContextAfter: 1,
    advMaxConcurrency: 1,
    advRequestsPerSecond: 0,
    advUseBatchPrompt: false,
    advInsertTagsToEnd: false,
    advNormalizeTagSpaces: false,
    advEnableCache: false,
    advEnableGlossary: false,
    advEnableSummary: false,
    advEnableContext: false,
    advEnableTm: true,
    advSystemPrompt: '',
    advUserPrompt: '',
    advBatchSystemPrompt: '',
    advBatchUserPrompt: '',
    advGlossaryEntries: '',
    advSummaryText: '',
    providers: [],
  };
}

export function configToForm(config) {
  const form = createDefaultConfigForm();
  const advanced = config?.interfaces?.mt?.advanced || {};
  const prompts = advanced.prompts || {};

  return {
    ...form,
    mtEnabled: !!config?.interfaces?.mt?.enabled,
    tmEnabled: !!config?.interfaces?.tm?.enabled,
    tbEnabled: !!config?.interfaces?.tb?.enabled,
    qaEnabled: !!config?.interfaces?.qa?.enabled,
    mtTimeout: config?.interfaces?.mt?.requestTimeoutMs || form.mtTimeout,
    mtBatch: config?.interfaces?.mt?.maxBatchSegments || form.mtBatch,
    host: config?.host || form.host,
    port: config?.port || form.port,
    retentionDays: Number(config?.log?.retentionDays) || form.retentionDays,
    maskSensitive: !!config?.log?.maskSensitive,
    hashTextForLog: !!config?.log?.hashTextForLog,
    storeRawPayload: !!config?.log?.storeRawPayload,
    memoqVersion: config?.integration?.memoqVersion || form.memoqVersion,
    memoqCustomInstallDir: config?.integration?.customInstallDir || '',
    liteLLMEnabled: !!config?.litellm?.enabled,
    liteLLMHost: config?.litellm?.host || form.liteLLMHost,
    liteLLMPort: config?.litellm?.port || form.liteLLMPort,
    liteLLMCli: config?.litellm?.cliBin || '',
    liteLLMPython: config?.litellm?.pythonBin || form.liteLLMPython,
    mtDefaultProvider: config?.interfaces?.mt?.defaultProviderId || '',
    advBatchSegments: advanced?.batching?.maxSegmentsPerBatch || config?.interfaces?.mt?.maxBatchSegments || form.advBatchSegments,
    advBatchChars: advanced?.batching?.maxCharactersPerBatch || form.advBatchChars,
    advRetryAttempts: advanced?.retry?.maxAttempts || form.advRetryAttempts,
    advRetryBackoff: advanced?.retry?.backoffMs || form.advRetryBackoff,
    advContextBefore: advanced?.context?.windowBefore || form.advContextBefore,
    advContextAfter: advanced?.context?.windowAfter || form.advContextAfter,
    advMaxConcurrency: advanced?.runtime?.maxConcurrency || form.advMaxConcurrency,
    advRequestsPerSecond: advanced?.runtime?.requestsPerSecond || form.advRequestsPerSecond,
    advUseBatchPrompt: !!prompts?.useBatchPromptForMultiSegment,
    advInsertTagsToEnd: !!advanced?.requestTypePolicy?.insertRequiredTagsToEnd,
    advNormalizeTagSpaces: !!advanced?.requestTypePolicy?.normalizeWhitespaceAroundTags,
    advEnableCache: !!advanced?.cache?.enabled,
    advEnableGlossary: !!advanced?.glossary?.enabled,
    advEnableSummary: !!advanced?.summary?.enabled,
    advEnableContext: !!advanced?.context?.enabled,
    advEnableTm: !(advanced?.tm?.enabled === false),
    advSystemPrompt: prompts?.systemPrompt || '',
    advUserPrompt: prompts?.userPrompt || '',
    advBatchSystemPrompt: prompts?.batchSystemPrompt || '',
    advBatchUserPrompt: prompts?.batchUserPrompt || '',
    advGlossaryEntries: advanced?.glossary?.entriesText || '',
    advSummaryText: advanced?.summary?.text || '',
    providers: Array.isArray(config?.interfaces?.mt?.providers)
      ? config.interfaces.mt.providers.filter((provider) => provider?.type !== 'mock').map((provider) => ({
        ...createEmptyProvider(),
        ...provider,
        apiKey: '',
      }))
      : [],
  };
}

export function buildConfigPayload(form) {
  return {
    host: String(form.host || '127.0.0.1').trim() || '127.0.0.1',
    port: Number(form.port || 5271),
    interfaces: {
      mt: {
        enabled: !!form.mtEnabled,
        requestTimeoutMs: Number(form.mtTimeout || 120000),
        maxBatchSegments: Number(form.mtBatch || 8),
        defaultProviderId: form.mtDefaultProvider || '',
        advanced: {
          requestTypePolicy: {
            insertRequiredTagsToEnd: !!form.advInsertTagsToEnd,
            normalizeWhitespaceAroundTags: !!form.advNormalizeTagSpaces,
          },
          batching: {
            maxSegmentsPerBatch: Number(form.advBatchSegments || form.mtBatch || 8),
            maxCharactersPerBatch: Number(form.advBatchChars || 0),
          },
          retry: {
            enabled: true,
            maxAttempts: Number(form.advRetryAttempts || 2),
            backoffMs: Number(form.advRetryBackoff || 150),
          },
          cache: {
            enabled: !!form.advEnableCache,
          },
          prompts: {
            activeTemplateId: 'default',
            systemPrompt: form.advSystemPrompt || '',
            userPrompt: form.advUserPrompt || '',
            batchSystemPrompt: form.advBatchSystemPrompt || '',
            batchUserPrompt: form.advBatchUserPrompt || '',
            useBatchPromptForMultiSegment: !!form.advUseBatchPrompt,
            templates: [
              {
                id: 'default',
                name: 'Default CAT Prompt',
                systemPrompt: form.advSystemPrompt || '',
                userPrompt: form.advUserPrompt || '',
                batchSystemPrompt: form.advBatchSystemPrompt || '',
                batchUserPrompt: form.advBatchUserPrompt || '',
              },
            ],
          },
          glossary: {
            enabled: !!form.advEnableGlossary,
            delimiter: ',',
            entriesText: form.advGlossaryEntries || '',
          },
          summary: {
            enabled: !!form.advEnableSummary,
            text: form.advSummaryText || '',
          },
          context: {
            enabled: !!form.advEnableContext,
            includeSource: true,
            windowBefore: Number(form.advContextBefore || 1),
            windowAfter: Number(form.advContextAfter || 1),
          },
          runtime: {
            maxConcurrency: Number(form.advMaxConcurrency || 1),
            requestsPerSecond: Number(form.advRequestsPerSecond || 0),
          },
          tm: {
            enabled: !!form.advEnableTm,
          },
        },
        providers: form.providers
          .filter((provider) => provider.id || provider.name || provider.endpoint || provider.model)
          .map((provider) => ({
            id: provider.id,
            name: provider.name,
            type: provider.type,
            endpoint: provider.endpoint,
            model: provider.model,
            enabled: !!provider.enabled,
          })),
      },
      tm: { enabled: !!form.tmEnabled },
      tb: { enabled: !!form.tbEnabled },
      qa: { enabled: !!form.qaEnabled },
    },
    log: {
      retentionDays: Number(form.retentionDays || 30),
      maskSensitive: !!form.maskSensitive,
      hashTextForLog: !!form.hashTextForLog,
      storeRawPayload: !!form.storeRawPayload,
    },
    integration: {
      memoqVersion: String(form.memoqVersion || '11'),
      customInstallDir: String(form.memoqCustomInstallDir || '').trim(),
    },
    litellm: {
      enabled: !!form.liteLLMEnabled,
      host: String(form.liteLLMHost || '127.0.0.1').trim() || '127.0.0.1',
      port: Number(form.liteLLMPort || 4000),
      cliBin: String(form.liteLLMCli || '').trim(),
      pythonBin: String(form.liteLLMPython || 'python3').trim() || 'python3',
    },
  };
}
