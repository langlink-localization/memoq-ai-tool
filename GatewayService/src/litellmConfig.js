function normalizeLiteLLMModel(model, provider) {
  const value = String(model || '').trim();
  if (value) return value;

  const providerId = String(provider?.id || '').trim();
  if (!providerId) return 'openai/unknown-model';
  return `openai/${providerId}`;
}

function buildLiteLLMConfig(config) {
  const providers = Array.isArray(config?.interfaces?.mt?.providers) ? config.interfaces.mt.providers : [];

  const modelList = providers
    .filter((provider) => provider && provider.enabled !== false)
    .filter((provider) => {
      const type = String(provider.type || '').trim().toLowerCase();
      return type === 'openai-compatible' || type === 'openai_compatible' || type === 'openai';
    })
    .map((provider) => ({
      model_name: String(provider.id || '').trim(),
      litellm_params: {
        model: normalizeLiteLLMModel(provider.model, provider),
        api_base: String(provider.endpoint || '').trim(),
        api_key: String(provider.apiKey || provider.api_key || 'none').trim() || 'none',
      },
    }))
    .filter((entry) => entry.model_name && entry.litellm_params.api_base);

  return {
    model_list: modelList,
    general_settings: {
      host: String(config?.litellm?.host || '127.0.0.1'),
      port: Number(config?.litellm?.port || 4000),
    },
  };
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') return '""';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (/^[A-Za-z0-9._:/-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function serializeLiteLLMConfigYaml(config) {
  const lines = ['model_list:'];
  const modelList = Array.isArray(config?.model_list) ? config.model_list : [];

  modelList.forEach((item) => {
    lines.push(`  - model_name: ${yamlScalar(item.model_name)}`);
    lines.push('    litellm_params:');
    Object.entries(item.litellm_params || {}).forEach(([key, value]) => {
      lines.push(`      ${key}: ${yamlScalar(value)}`);
    });
  });

  lines.push('');
  lines.push('general_settings:');
  Object.entries(config?.general_settings || {}).forEach(([key, value]) => {
    lines.push(`  ${key}: ${yamlScalar(value)}`);
  });

  lines.push('');
  return `${lines.join('\n')}`;
}

module.exports = {
  buildLiteLLMConfig,
  serializeLiteLLMConfigYaml,
};
