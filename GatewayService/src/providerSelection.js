const DESKTOP_TRANSPORT_PROVIDER_IDS = new Set([
  '',
  'GatewayDesktop_LLM',
  'desktop-gateway',
  'desktop_gateway',
]);

function isTransportProviderId(providerId) {
  return DESKTOP_TRANSPORT_PROVIDER_IDS.has(String(providerId || '').trim());
}

function pickProvider(interfaceConfig, providerId) {
  const providers = Array.isArray(interfaceConfig?.providers) ? interfaceConfig.providers : [];
  if (!providers.length) return null;

  const requested = String(providerId || '').trim();
  const defaultProviderId = String(interfaceConfig?.defaultProviderId || '').trim();
  const firstEnabled = providers.find((item) => item && item.enabled !== false) || providers[0] || null;

  if (!isTransportProviderId(requested)) {
    const byRequestedId = providers.find((item) => item && item.enabled !== false && String(item.id) === requested);
    if (byRequestedId) return byRequestedId;
  }

  if (defaultProviderId) {
    const byDefaultId = providers.find((item) => item && item.enabled !== false && String(item.id) === defaultProviderId);
    if (byDefaultId) return byDefaultId;
  }

  return firstEnabled;
}

function resolveMtProviderSelection(interfaceConfig, payload) {
  const provider = pickProvider(interfaceConfig, payload?.providerId);
  if (!provider) return null;

  return {
    provider,
    providerId: String(provider.id || ''),
    model: String(provider.model || ''),
  };
}

module.exports = {
  pickProvider,
  isTransportProviderId,
  resolveMtProviderSelection,
};
