import { toDatetimeLocal } from './utils';

function getGatewayBaseUrl() {
  return (window.gatewayDesktop?.getGatewayBaseUrl?.() || 'http://127.0.0.1:5271').replace(/\/+$/, '');
}

async function apiFetch(path, options) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${getGatewayBaseUrl()}${normalizedPath}`, options);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload?.error?.message || payload?.message || message;
    } catch (error) {
      // Keep the fallback message if the response is not JSON.
    }
    throw new Error(message);
  }
  return response;
}

export async function fetchHealth() {
  const response = await apiFetch('/health');
  return response.json();
}

export async function fetchProviderHealth() {
  const response = await apiFetch('/admin/providers/health');
  return response.json();
}

export async function fetchIntegrationStatus() {
  const response = await apiFetch('/desktop/integration/status');
  return response.json();
}

export async function runIntegrationAction(path) {
  const response = await apiFetch(path, { method: 'POST' });
  return response.json();
}

export async function fetchConfig() {
  const response = await apiFetch('/admin/config');
  return response.json();
}

export async function saveProviderSecret(providerId, apiKey) {
  if (!providerId || !apiKey) return;
  await apiFetch(`/admin/config/secrets/${encodeURIComponent(providerId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
}

export async function saveConfig(body) {
  const response = await apiFetch('/admin/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => null);
}

export async function fetchLogs(filters) {
  const params = new URLSearchParams();
  const mapping = {
    interface: filters.interfaceName,
    requestType: filters.requestType,
    provider: filters.provider,
    model: filters.model,
    documentId: filters.documentId,
    segmentHash: filters.segmentHash,
    requestId: filters.requestId,
    keyword: filters.keyword,
    status: filters.status,
  };

  Object.entries(mapping).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  if (filters.start) params.set('start', new Date(filters.start).toISOString());
  if (filters.end) params.set('end', new Date(filters.end).toISOString());
  if (filters.includePayload) params.set('includePayload', 'true');

  const response = await apiFetch(`/logs?${params.toString()}`);
  return response.json();
}

export function createDefaultLogFiltersFromNow() {
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  return {
    interfaceName: 'mt',
    requestType: '',
    provider: '',
    model: '',
    documentId: '',
    segmentHash: '',
    requestId: '',
    keyword: '',
    status: '',
    start: toDatetimeLocal(fifteenMinutesAgo.toISOString()),
    end: toDatetimeLocal(now.toISOString()),
    includePayload: false,
  };
}
