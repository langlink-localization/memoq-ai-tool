const fs = require('fs');
const path = require('path');
const { protect, unprotect } = require('./security');

const RUNTIME_DIR = path.join(process.env.APPDATA || process.cwd(), 'memoq-ai-gateway');
const SECRETS_PATH = path.join(RUNTIME_DIR, 'secrets.json');

function ensureDir() {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function loadSecretMap() {
  ensureDir();
  if (!fs.existsSync(SECRETS_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(SECRETS_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveSecretMap(secretMap) {
  ensureDir();
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(secretMap, null, 2), 'utf8');
}

function buildProviderSecretRef(providerId) {
  return `provider:${String(providerId || '').trim()}:apiKey`;
}

function hasProviderSecret(provider) {
  return Boolean(provider?.secretRef || provider?.encryptedApiKey);
}

function getProviderSecret(provider) {
  const secretRef = String(provider?.secretRef || '').trim();
  if (secretRef) {
    const secretMap = loadSecretMap();
    const entry = secretMap[secretRef];
    if (entry?.encryptedValue) {
      return unprotect(String(entry.encryptedValue));
    }
  }

  if (provider?.encryptedApiKey) {
    return unprotect(String(provider.encryptedApiKey));
  }

  return '';
}

function getProviderSecretMetadata(provider) {
  const secretRef = String(provider?.secretRef || '').trim();
  if (!secretRef) {
    return null;
  }

  const secretMap = loadSecretMap();
  const entry = secretMap[secretRef];
  if (!entry) {
    return null;
  }

  return {
    secretRef,
    providedAt: String(entry.providedAt || ''),
  };
}

function setProviderSecret(providerId, apiKey, existingSecretRef = '') {
  const secretRef = String(existingSecretRef || buildProviderSecretRef(providerId)).trim();
  const secretMap = loadSecretMap();
  const providedAt = new Date().toISOString();
  secretMap[secretRef] = {
    type: 'apiKey',
    providerId: String(providerId || '').trim(),
    encryptedValue: protect(String(apiKey || '')),
    providedAt,
  };
  saveSecretMap(secretMap);
  return {
    secretRef,
    providedAt,
  };
}

function migrateLegacyProviderSecrets(config) {
  const providers = Array.isArray(config?.interfaces?.mt?.providers) ? config.interfaces.mt.providers : [];
  if (!providers.length) {
    return { config, changed: false };
  }

  const secretMap = loadSecretMap();
  let changed = false;

  providers.forEach((provider) => {
    if (!provider?.id || !provider?.encryptedApiKey || provider?.secretRef) {
      return;
    }

    const secretRef = buildProviderSecretRef(provider.id);
    secretMap[secretRef] = {
      type: 'apiKey',
      providerId: String(provider.id),
      encryptedValue: String(provider.encryptedApiKey),
      providedAt: String(provider.apiKeyProvidedAt || new Date().toISOString()),
    };
    provider.secretRef = secretRef;
    delete provider.encryptedApiKey;
    changed = true;
  });

  if (changed) {
    saveSecretMap(secretMap);
  }

  return { config, changed };
}

module.exports = {
  SECRETS_PATH,
  buildProviderSecretRef,
  getProviderSecret,
  getProviderSecretMetadata,
  hasProviderSecret,
  migrateLegacyProviderSecrets,
  setProviderSecret,
};
