const fs = require('fs');
const path = require('path');
const ElectronStore = require('electron-store');
const { DEFAULT_HOST, DEFAULT_PORT, CONTRACT_VERSION } = require('./desktopContract');
const { normalizeAdvancedConfig } = require('./mtOrchestrator');

function defaultMtProviders() {
  return [
    {
      id: 'mock-llm',
      name: 'Mock LLM',
      type: 'mock',
      model: 'memoq-mock-model',
      enabled: true,
    },
    {
      id: 'openai-gpt-5-mini',
      name: 'OpenAI GPT-5 mini',
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      enabled: true,
    },
  ];
}

const DEFAULT_MT_PROVIDER_ID = 'openai-gpt-5-mini';
const SUPPORTED_MEMOQ_VERSIONS = ['10', '11', '12'];
const CONFIG_DIR = path.join(process.env.APPDATA || process.cwd(), 'memoq-ai-gateway');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  contractVersion: CONTRACT_VERSION,
  log: {
    retentionDays: 30,
    maskSensitive: true,
    hashTextForLog: true,
    storeRawPayload: true,
  },
  interfaces: {
    mt: {
      enabled: true,
      requestTimeoutMs: 120000,
      maxBatchSegments: 8,
      defaultProviderId: DEFAULT_MT_PROVIDER_ID,
      providers: defaultMtProviders(),
      advanced: normalizeAdvancedConfig({}, { maxBatchSegments: 8 }),
    },
    tm: { enabled: true },
    tb: { enabled: true },
    qa: { enabled: true },
  },
  security: {
    encryptionMode: 'dpapi',
  },
  integration: {
    memoqVersion: '11',
    customInstallDir: '',
  },
  litellm: {
    enabled: true,
    host: '127.0.0.1',
    port: 4000,
    cliBin: '',
    pythonBin: process.platform === 'win32' ? 'py' : 'python3',
  },
  uiState: {},
  featureFlags: {},
};

let configStore;

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getConfigStore() {
  if (!configStore) {
    ensureDir();
    configStore = new ElectronStore({
      cwd: CONFIG_DIR,
      name: 'config',
      clearInvalidConfig: true,
    });
  }

  return configStore;
}

function defaultMtProvider() {
  return defaultMtProviders()[0];
}

function normalizeMtProvider(provider, fallbackIndex) {
  const item = provider && typeof provider === 'object' ? provider : {};
  const id = String(item.id || item.name || `provider-${fallbackIndex + 1}`).trim();

  return {
    ...item,
    id,
    name: String(item.name || id).trim(),
    type: String(item.type || 'openai-compatible').trim() || 'openai-compatible',
    model: String(item.model || '').trim(),
    endpoint: String(item.endpoint || '').trim(),
    enabled: item.enabled !== false,
    secretRef: String(item.secretRef || '').trim(),
    apiKeyProvidedAt: String(item.apiKeyProvidedAt || '').trim(),
  };
}

function appendMissingBuiltInMtProviders(providers) {
  const normalizedProviders = Array.isArray(providers) ? providers.slice() : [];
  const existingIds = new Set(normalizedProviders.map((provider) => String(provider?.id || '').trim()).filter(Boolean));

  defaultMtProviders().forEach((provider) => {
    if (!existingIds.has(provider.id)) {
      normalizedProviders.push({ ...provider });
    }
  });

  return normalizedProviders;
}

function normalizeMtConfig(mtConfig, baseMtConfig) {
  const baseProviders = Array.isArray(baseMtConfig?.providers) ? baseMtConfig.providers : [defaultMtProvider()];
  const requestedProviders = Array.isArray(mtConfig?.providers) ? mtConfig.providers : baseProviders;
  const normalizedProviders = appendMissingBuiltInMtProviders(
    (requestedProviders.length ? requestedProviders : [defaultMtProvider()]).map(normalizeMtProvider)
  );

  const preferredDefault = normalizedProviders.find((provider) => provider.enabled !== false && provider.id === DEFAULT_MT_PROVIDER_ID);
  const firstEnabled = preferredDefault || normalizedProviders.find((provider) => provider.enabled !== false) || normalizedProviders[0];
  const requestedDefault = String(mtConfig?.defaultProviderId || '').trim();
  const hasRequestedDefault = requestedDefault && normalizedProviders.some((provider) => provider.enabled !== false && provider.id === requestedDefault);
  const shouldUpgradeLegacyDefault = requestedDefault === 'mock-llm'
    && normalizedProviders.some((provider) => provider.enabled !== false && provider.id === DEFAULT_MT_PROVIDER_ID);

  return {
    ...mtConfig,
    providers: normalizedProviders,
    defaultProviderId: hasRequestedDefault && !shouldUpgradeLegacyDefault ? requestedDefault : String(firstEnabled?.id || ''),
    advanced: normalizeAdvancedConfig(mtConfig?.advanced, {
      maxBatchSegments: Number(mtConfig?.maxBatchSegments || baseMtConfig?.maxBatchSegments || 8),
    }),
  };
}

function mergeConfig(base, patch) {
  if (!patch || typeof patch !== 'object') return base;

  const merged = Object.assign({}, base, patch);
  merged.interfaces = Object.assign({}, base.interfaces, patch.interfaces || {});
  merged.interfaces.mt = Object.assign({}, base.interfaces.mt, patch.interfaces && patch.interfaces.mt || {});
  merged.interfaces.tm = Object.assign({}, base.interfaces.tm, patch.interfaces && patch.interfaces.tm || {});
  merged.interfaces.tb = Object.assign({}, base.interfaces.tb, patch.interfaces && patch.interfaces.tb || {});
  merged.interfaces.qa = Object.assign({}, base.interfaces.qa, patch.interfaces && patch.interfaces.qa || {});
  merged.interfaces.mt = normalizeMtConfig(merged.interfaces.mt, base.interfaces?.mt || {});
  merged.log = Object.assign({}, base.log, patch.log || {});
  merged.security = Object.assign({}, base.security, patch.security || {});
  merged.integration = Object.assign({}, base.integration, patch.integration || {});
  if (!SUPPORTED_MEMOQ_VERSIONS.includes(String(merged.integration.memoqVersion || ''))) {
    merged.integration.memoqVersion = base.integration?.memoqVersion || '11';
  }
  merged.integration.customInstallDir = String(merged.integration.customInstallDir || '').trim();
  merged.litellm = Object.assign({}, base.litellm, patch.litellm || {});
  merged.uiState = Object.assign({}, base.uiState, patch.uiState || {});
  merged.featureFlags = Object.assign({}, base.featureFlags, patch.featureFlags || {});
  merged.port = patch.port || base.port;
  merged.host = patch.host || base.host;
  return merged;
}

function mergeMtProvidersForAdmin(baseProviders, nextProviders) {
  if (!Array.isArray(nextProviders)) return undefined;

  const existingById = new Map(
    (Array.isArray(baseProviders) ? baseProviders : [])
      .map((provider) => [String(provider?.id || '').trim(), provider])
      .filter(([id]) => id)
  );

  return nextProviders.map((provider, index) => {
    const rawId = String(provider?.id || provider?.name || `provider-${index + 1}`).trim();
    const existing = existingById.get(rawId);
    return {
      ...(existing || {}),
      ...(provider || {}),
      secretRef: provider?.secretRef || existing?.secretRef || '',
      apiKeyProvidedAt: provider?.apiKeyProvidedAt || existing?.apiKeyProvidedAt || '',
    };
  });
}

function mergeAdminConfig(base, patch) {
  if (!patch || typeof patch !== 'object') return base;

  const normalizedPatch = { ...patch };
  if (patch.interfaces && typeof patch.interfaces === 'object') {
    normalizedPatch.interfaces = { ...patch.interfaces };
  }
  if (patch.interfaces?.mt && typeof patch.interfaces.mt === 'object') {
    normalizedPatch.interfaces.mt = { ...patch.interfaces.mt };
  }
  if (Array.isArray(patch.interfaces?.mt?.providers)) {
    normalizedPatch.interfaces.mt.providers = mergeMtProvidersForAdmin(
      base?.interfaces?.mt?.providers,
      patch.interfaces.mt.providers
    );
  }

  return mergeConfig(base, normalizedPatch);
}

function stripSensitiveConfig(config) {
  const clone = JSON.parse(JSON.stringify(config || DEFAULT_CONFIG));
  const providers = Array.isArray(clone?.interfaces?.mt?.providers) ? clone.interfaces.mt.providers : [];
  clone.interfaces.mt.providers = providers.map((provider) => {
    const nextProvider = { ...provider };
    delete nextProvider.apiKey;
    delete nextProvider.encryptedApiKey;
    return nextProvider;
  });
  return clone;
}

function loadConfig() {
  ensureDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8') || '{}');
    } catch (_error) {
      const fallback = stripSensitiveConfig(DEFAULT_CONFIG);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(fallback, null, 2), 'utf8');
      configStore = undefined;
      return mergeConfig(DEFAULT_CONFIG, fallback);
    }
  }

  const store = getConfigStore();
  const loaded = store.store && typeof store.store === 'object' ? store.store : {};
  return mergeConfig(DEFAULT_CONFIG, loaded);
}

function saveConfig(config) {
  const store = getConfigStore();
  store.store = stripSensitiveConfig(config);
}

function sanitizeConfigForClient(config) {
  return {
    contractVersion: config.contractVersion || CONTRACT_VERSION,
    port: config.port,
    host: config.host,
    log: config.log,
    security: config.security || {},
    integration: {
      memoqVersion: String(config.integration?.memoqVersion || '11'),
      customInstallDir: String(config.integration?.customInstallDir || ''),
      supportedVersions: SUPPORTED_MEMOQ_VERSIONS.slice(),
    },
    litellm: config.litellm || {},
    uiState: config.uiState || {},
    featureFlags: config.featureFlags || {},
    interfaces: {
      mt: {
        enabled: !!(config.interfaces && config.interfaces.mt && config.interfaces.mt.enabled),
        requestTimeoutMs: config.interfaces.mt ? config.interfaces.mt.requestTimeoutMs : 120000,
        maxBatchSegments: config.interfaces.mt ? config.interfaces.mt.maxBatchSegments : 8,
        defaultProviderId: config.interfaces.mt ? config.interfaces.mt.defaultProviderId || '' : '',
        advanced: normalizeAdvancedConfig(config.interfaces?.mt?.advanced, {
          maxBatchSegments: config.interfaces?.mt?.maxBatchSegments || 8,
        }),
        providers: (config.interfaces.mt && config.interfaces.mt.providers || []).map((provider) => ({
          id: provider.id,
          name: provider.name,
          type: provider.type,
          model: provider.model,
          endpoint: provider.endpoint,
          enabled: provider.enabled !== false,
          hasApiKey: Boolean(provider.secretRef || provider.encryptedApiKey),
          secretRef: provider.secretRef || '',
        })),
      },
      tm: { enabled: !!(config.interfaces && config.interfaces.tm && config.interfaces.tm.enabled) },
      tb: { enabled: !!(config.interfaces && config.interfaces.tb && config.interfaces.tb.enabled) },
      qa: { enabled: !!(config.interfaces && config.interfaces.qa && config.interfaces.qa.enabled) },
    },
  };
}

module.exports = {
  CONFIG_FILE,
  loadConfig,
  mergeAdminConfig,
  mergeConfig,
  normalizeMtConfig,
  saveConfig,
  sanitizeConfigForClient,
  SUPPORTED_MEMOQ_VERSIONS,
};
