const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLiteLLMConfig, serializeLiteLLMConfigYaml } = require('../src/litellmConfig');

test('buildLiteLLMConfig maps openai-compatible desktop providers into LiteLLM model_list entries', () => {
  const config = buildLiteLLMConfig({
    host: '127.0.0.1',
    port: 5271,
    litellm: {
      enabled: true,
      host: '127.0.0.1',
      port: 4000,
    },
    interfaces: {
      mt: {
        defaultProviderId: 'openrouter-main',
        providers: [
          {
            id: 'openrouter-main',
            type: 'openai-compatible',
            endpoint: 'https://openrouter.ai/api/v1',
            model: 'openai/gpt-4.1-mini',
            apiKey: 'sk-openrouter',
            enabled: true,
          },
          {
            id: 'mock-llm',
            type: 'mock',
            model: 'memoq-mock-model',
            enabled: true,
          },
        ],
      },
    },
  });

  assert.equal(config.model_list.length, 1);
  assert.equal(config.model_list[0].model_name, 'openrouter-main');
  assert.equal(config.model_list[0].litellm_params.model, 'openai/gpt-4.1-mini');
  assert.equal(config.model_list[0].litellm_params.api_base, 'https://openrouter.ai/api/v1');
  assert.equal(config.model_list[0].litellm_params.api_key, 'sk-openrouter');
});

test('buildLiteLLMConfig also includes openai_compatible providers in LiteLLM model_list entries', () => {
  const config = buildLiteLLMConfig({
    litellm: {
      enabled: true,
      host: '127.0.0.1',
      port: 4000,
    },
    interfaces: {
      mt: {
        providers: [
          {
            id: 'custom-openai-compatible',
            type: 'openai_compatible',
            endpoint: 'https://example.test/v1',
            model: 'openai/gpt-4.1-mini',
            apiKey: 'sk-test',
            enabled: true,
          },
        ],
      },
    },
  });

  assert.equal(config.model_list.length, 1);
  assert.equal(config.model_list[0].model_name, 'custom-openai-compatible');
  assert.equal(config.model_list[0].litellm_params.api_base, 'https://example.test/v1');
});

test('serializeLiteLLMConfigYaml emits a config file containing model_list and general settings', () => {
  const yaml = serializeLiteLLMConfigYaml({
    model_list: [
      {
        model_name: 'provider-a',
        litellm_params: {
          model: 'openai/gpt-4.1-mini',
          api_base: 'https://api.example.com/v1',
          api_key: 'sk-test',
        },
      },
    ],
    general_settings: {
      host: '127.0.0.1',
      port: 4000,
    },
  });

  assert.match(yaml, /model_list:/);
  assert.match(yaml, /model_name: provider-a/);
  assert.match(yaml, /model: openai\/gpt-4\.1-mini/);
  assert.match(yaml, /api_base: https:\/\/api\.example\.com\/v1/);
});
