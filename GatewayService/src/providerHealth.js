function normalizeType(type) {
  return String(type || '').trim().toLowerCase();
}

function buildProbeFailure(code, message) {
  return {
    ok: false,
    code,
    message,
  };
}

function normalizeFetchImpl(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  if (typeof global.fetch === 'function') return global.fetch.bind(global);
  return null;
}

function buildDirectProviderProbeUrl(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    url.search = '';
    if (/\/chat\/completions\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/chat\/completions\/?$/i, '/models');
    } else if (/\/v\d+\/?$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/models`;
    } else if (/\/models\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/$/, '');
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/models`;
    }
    return url.toString();
  } catch (_error) {
    return value;
  }
}

function buildDirectProviderChatProbeUrl(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    url.search = '';
    if (/\/chat\/completions\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/$/, '');
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
    }
    return url.toString();
  } catch (_error) {
    return value;
  }
}

function buildLiteLLMProbeUrl(litellmConfig = {}) {
  const host = String(litellmConfig?.host || '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(litellmConfig?.port || 4000);
  return `http://${host}:${port}/v1/models`;
}

async function fetchProbe(fetchImpl, url, requestOptions = {}, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(url, {
      method: requestOptions.method || 'GET',
      headers: requestOptions.headers || {},
      body: requestOptions.body,
      signal: controller?.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        timeout: true,
        error,
        durationMs: Date.now() - startedAt,
      };
    }
    return {
      error,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseModelsPayload(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch (_error) {
    return null;
  }
}

function shouldUseLiteLLMProbe(provider, runtimeConfig = {}) {
  const type = normalizeType(provider?.type);
  return Boolean(runtimeConfig?.litellm?.enabled)
    && (type === 'openai' || type === 'openai-compatible' || type === 'openai_compatible');
}

function classifyHttpProbeFailure(status, providerId, targetLabel) {
  if (status === 401) {
    return buildProbeFailure('AUTH_FAILED', `${targetLabel} rejected credentials for ${providerId || 'provider'}.`);
  }
  if (status === 403) {
    return buildProbeFailure('ACCESS_DENIED', `${targetLabel} denied access for ${providerId || 'provider'}.`);
  }
  if (status === 404) {
    return buildProbeFailure('PROBE_ENDPOINT_MISSING', `${targetLabel} probe endpoint is unavailable for ${providerId || 'provider'}.`);
  }
  if (status >= 500) {
    return buildProbeFailure('UPSTREAM_UNAVAILABLE', `${targetLabel} is reachable but returned ${status} for ${providerId || 'provider'}.`);
  }
  return buildProbeFailure('PROBE_FAILED', `${targetLabel} probe failed (${status}) for ${providerId || 'provider'}.`);
}

function extractModelIds(payload) {
  const models = Array.isArray(payload?.data) ? payload.data : [];
  return models.map((item) => String(item?.id || '').trim()).filter(Boolean);
}

function matchesConfiguredModel(modelIds, configuredModel) {
  const expected = String(configuredModel || '').trim();
  if (!expected) return true;
  return modelIds.includes(expected);
}

function buildChatProbePayload(provider) {
  return JSON.stringify({
    model: String(provider?.model || '').trim() || 'health-check',
    messages: [
      {
        role: 'user',
        content: 'ping',
      },
    ],
    max_tokens: 1,
    temperature: 0,
  });
}

function createActiveProviderProbe(options = {}) {
  const fetchImpl = normalizeFetchImpl(options.fetch);
  const timeoutMs = Number(options.timeoutMs || 2500);

  if (!fetchImpl) {
    return async () => buildProbeFailure('FETCH_UNAVAILABLE', 'fetch is unavailable for provider probing.');
  }

  return async function probe(provider, probeOptions = {}) {
    const runtimeConfig = probeOptions.runtimeConfig || {};
    const apiKey = String(probeOptions.apiKey || '').trim();

    if (shouldUseLiteLLMProbe(provider, runtimeConfig)) {
      const probeUrl = buildLiteLLMProbeUrl(runtimeConfig.litellm);
      const result = await fetchProbe(fetchImpl, probeUrl, { Accept: 'application/json' }, timeoutMs);
      if (result?.timeout) {
        return {
          ...buildProbeFailure('PROBE_TIMEOUT', `LiteLLM probe timed out for ${provider?.id || 'provider'}.`),
          target: probeUrl,
          durationMs: result.durationMs,
        };
      }
      if (result?.error) {
        return {
          ...buildProbeFailure('PROBE_NETWORK_ERROR', `LiteLLM probe could not reach ${provider?.id || 'provider'}: ${result.error.message || 'network error'}`),
          target: probeUrl,
          durationMs: result.durationMs,
        };
      }
      if (!result.ok) {
        return {
          ...classifyHttpProbeFailure(result.status, provider?.id, 'LiteLLM'),
          target: probeUrl,
          durationMs: result.durationMs,
        };
      }

      const payload = parseModelsPayload(result.text);
      const modelIds = extractModelIds(payload);
      if (modelIds.length) {
        const providerId = String(provider?.id || '').trim();
        if (!modelIds.includes(providerId)) {
          return {
            ...buildProbeFailure('MODEL_NOT_EXPOSED', `LiteLLM is reachable but model "${providerId}" is not exposed.`),
            target: probeUrl,
            durationMs: result.durationMs,
          };
        }
      }

      return {
        ok: true,
        message: 'LiteLLM probe succeeded.',
        target: probeUrl,
        durationMs: result.durationMs,
      };
    }

    const probeUrl = buildDirectProviderProbeUrl(provider?.endpoint);
    const headers = { Accept: 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const result = await fetchProbe(fetchImpl, probeUrl, { method: 'GET', headers }, timeoutMs);
    if (result?.timeout) {
      return {
        ...buildProbeFailure('PROBE_TIMEOUT', `Provider probe timed out for ${provider?.id || 'provider'}.`),
        target: probeUrl,
        durationMs: result.durationMs,
      };
    }
    if (result?.error) {
      return {
        ...buildProbeFailure('PROBE_NETWORK_ERROR', `Provider probe could not reach ${provider?.id || 'provider'}: ${result.error.message || 'network error'}`),
        target: probeUrl,
        durationMs: result.durationMs,
      };
    }
    if (!result.ok) {
      if (result.status === 404) {
        const chatProbeUrl = buildDirectProviderChatProbeUrl(provider?.endpoint);
        const chatProbeResult = await fetchProbe(fetchImpl, chatProbeUrl, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: buildChatProbePayload(provider),
        }, timeoutMs);

        if (chatProbeResult?.timeout) {
          return {
            ...buildProbeFailure('PROBE_TIMEOUT', `Provider chat probe timed out for ${provider?.id || 'provider'}.`),
            target: chatProbeUrl,
            durationMs: chatProbeResult.durationMs,
          };
        }
        if (chatProbeResult?.error) {
          return {
            ...buildProbeFailure('PROBE_NETWORK_ERROR', `Provider chat probe could not reach ${provider?.id || 'provider'}: ${chatProbeResult.error.message || 'network error'}`),
            target: chatProbeUrl,
            durationMs: chatProbeResult.durationMs,
          };
        }
        if (!chatProbeResult.ok) {
          return {
            ...classifyHttpProbeFailure(chatProbeResult.status, provider?.id, 'Provider'),
            target: chatProbeUrl,
            durationMs: chatProbeResult.durationMs,
          };
        }

        return {
          ok: true,
          message: 'Provider chat probe succeeded.',
          target: chatProbeUrl,
          durationMs: chatProbeResult.durationMs,
        };
      }
      return {
        ...classifyHttpProbeFailure(result.status, provider?.id, 'Provider'),
        target: probeUrl,
        durationMs: result.durationMs,
      };
    }

    const payload = parseModelsPayload(result.text);
    const modelIds = extractModelIds(payload);
    if (modelIds.length && !matchesConfiguredModel(modelIds, provider?.model)) {
      return {
        ...buildProbeFailure('MODEL_NOT_EXPOSED', `Provider is reachable but model "${String(provider?.model || '').trim()}" is not exposed.`),
        target: probeUrl,
        durationMs: result.durationMs,
      };
    }

    return {
      ok: true,
      message: 'Provider endpoint probe succeeded.',
      target: probeUrl,
      durationMs: result.durationMs,
    };
  };
}

async function checkMtProviderHealth(provider, options = {}) {
  const item = provider && typeof provider === 'object' ? provider : {};
  const runtimeConfig = options.runtimeConfig || {};
  const litellmStatus = options.litellmStatus || {};
  const apiKey = String(options.apiKey || '').trim();
  const probe = typeof options.probe === 'function' ? options.probe : null;
  const type = normalizeType(item.type);
  let probeMetadata = {
    target: '',
    durationMs: 0,
  };

  if (item.enabled === false) {
    return {
      providerId: String(item.id || ''),
      enabled: false,
      healthy: false,
      code: 'DISABLED',
      message: 'Provider is disabled.',
    };
  }

  if (type === 'mock') {
    return {
      providerId: String(item.id || ''),
      enabled: true,
      healthy: true,
      code: 'OK',
      message: 'Mock provider is always available.',
    };
  }

  if (!item.endpoint) {
    return {
      providerId: String(item.id || ''),
      enabled: true,
      healthy: false,
      code: 'ENDPOINT_MISSING',
      message: 'Provider endpoint is missing.',
    };
  }

  if (!apiKey) {
    return {
      providerId: String(item.id || ''),
      enabled: true,
      healthy: false,
      code: 'API_KEY_MISSING',
      message: 'Provider API key is missing.',
    };
  }

  if (runtimeConfig?.litellm?.enabled && !litellmStatus?.running) {
    return {
      providerId: String(item.id || ''),
      enabled: true,
      healthy: false,
      code: 'LITELLM_UNAVAILABLE',
      message: String(litellmStatus?.error || 'LiteLLM is enabled but not running.'),
    };
  }

  if (probe) {
    try {
      const probeResult = await probe(item, options);
      probeMetadata = {
        target: String(probeResult?.target || ''),
        durationMs: Number(probeResult?.durationMs || 0),
      };
      if (probeResult && probeResult.ok === false) {
        return {
          providerId: String(item.id || ''),
          enabled: true,
          healthy: false,
          code: String(probeResult.code || 'PROBE_FAILED'),
          message: String(probeResult.message || 'Provider probe failed.'),
          target: probeMetadata.target,
          durationMs: probeMetadata.durationMs,
        };
      }
    } catch (error) {
      return {
        providerId: String(item.id || ''),
        enabled: true,
        healthy: false,
        code: 'PROBE_FAILED',
        message: String(error?.message || 'Provider probe failed.'),
      };
    }
  }

  return {
    providerId: String(item.id || ''),
    enabled: true,
    healthy: true,
    code: 'OK',
    message: 'Provider has the required desktop-side configuration.',
    target: probeMetadata.target,
    durationMs: probeMetadata.durationMs,
  };
}

function summarizeProviderHealth(items) {
  const list = Array.isArray(items) ? items : [];
  const enabledItems = list.filter((item) => item?.enabled !== false);
  const unhealthyItems = enabledItems.filter((item) => item?.healthy === false);
  return {
    total: list.length,
    enabled: enabledItems.length,
    healthy: enabledItems.length - unhealthyItems.length,
    unhealthy: unhealthyItems.length,
  };
}

module.exports = {
  buildDirectProviderProbeUrl,
  createActiveProviderProbe,
  checkMtProviderHealth,
  summarizeProviderHealth,
};
