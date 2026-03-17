const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  createDb,
  initSchema,
  deleteExpiredLogs,
  insertLog,
  queryLogs,
} = require('./db');
const { loadConfig, saveConfig, sanitizeConfigForClient, mergeAdminConfig } = require('./config');
const { createLiteLLMManager } = require('./litellmManager');
const {
  getProviderSecret,
  hasProviderSecret,
  migrateLegacyProviderSecrets,
  setProviderSecret,
} = require('./secretStore');
const { pickProvider, resolveMtProviderSelection } = require('./providerSelection');
const { translateWithMock, translateWithProvider, tmLookup, tbLookup, qaCheck } = require('./translationService');
const { createMtRuntime, normalizeAdvancedConfig, translateMtRequest } = require('./mtOrchestrator');
const { checkMtProviderHealth, createActiveProviderProbe, summarizeProviderHealth } = require('./providerHealth');
const { createMtRuntimeControls } = require('./mtRuntimeControls');
const { PRODUCT_NAME, CONTRACT_VERSION, DEFAULT_HOST, DEFAULT_PORT, ROUTES, ERROR_CODES } = require('./desktopContract');
const { IntegrationError, getIntegrationStatus, installIntegration } = require('./integrationService');

function resolveDesktopVersion() {
  const candidates = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../package.json'),
    path.join(process.resourcesPath || '', 'app', 'package.json'),
    path.join(process.resourcesPath || '', 'app.asar', 'package.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const manifest = require(candidate);
      if (manifest?.version) return String(manifest.version);
    } catch (_error) {
      // Continue probing other known package.json locations.
    }
  }

  return process.env.npm_package_version || '0.0.0';
}

const VERSION = resolveDesktopVersion();
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;

function safeValue(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function segmentFingerprint(segment, fallbackIndex) {
  const index = Number.isFinite(segment?.index) ? segment.index : fallbackIndex;
  return {
    index,
    sourceHash: hashText(segment?.text),
    plainTextHash: hashText(segment?.plainText),
    tmSourceHash: hashText(segment?.tmSource),
    tmTargetHash: hashText(segment?.tmTarget),
  };
}

function clampText(text, maxLength) {
  const value = safeValue(text);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function bytesOf(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function buildPayloadForLog(payload, logConfig) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const masks = logConfig?.maskSensitive || false;
  const hashOnly = logConfig?.hashTextForLog || false;

  if (!Array.isArray(segments)) {
    return {
      requestId: safeValue(payload?.requestId),
      traceId: safeValue(payload?.traceId),
      sourceLanguage: safeValue(payload?.sourceLanguage),
      targetLanguage: safeValue(payload?.targetLanguage),
      requestType: safeValue(payload?.requestType),
      providerId: safeValue(payload?.providerId),
      model: safeValue(payload?.model),
      segmentCount: 0,
      segmentTextHashes: [],
      metadata: payload?.metadata || {},
      body: '{ "segmentCount": 0 }',
    };
  }

  const segmentCount = segments.length;
  if (masks) {
    return {
      requestId: safeValue(payload?.requestId),
      traceId: safeValue(payload?.traceId),
      sourceLanguage: safeValue(payload?.sourceLanguage),
      targetLanguage: safeValue(payload?.targetLanguage),
      requestType: safeValue(payload?.requestType),
      providerId: safeValue(payload?.providerId),
      model: safeValue(payload?.model),
      segmentCount,
      segmentTextHashes: segments.map(segmentFingerprint),
      metadata: payload?.metadata || {},
    };
  }

  return {
    requestId: safeValue(payload?.requestId),
    traceId: safeValue(payload?.traceId),
    sourceLanguage: safeValue(payload?.sourceLanguage),
    targetLanguage: safeValue(payload?.targetLanguage),
    requestType: safeValue(payload?.requestType),
    providerId: safeValue(payload?.providerId),
    model: safeValue(payload?.model),
    segmentCount,
    segments: segments.map((segment, index) => ({
      index: Number.isFinite(segment?.index) ? segment.index : index,
      text: hashOnly ? hashText(segment?.text) : clampText(segment?.text, 2000),
      plainText: hashOnly ? hashText(segment?.plainText) : clampText(segment?.plainText, 2000),
      tmSource: hashOnly ? hashText(segment?.tmSource) : clampText(segment?.tmSource, 2000),
      tmTarget: hashOnly ? hashText(segment?.tmTarget) : clampText(segment?.tmTarget, 2000),
    })),
    metadata: payload?.metadata || {},
  };
}

function sanitizePayload(payload) {
  return {
    requestId: payload.requestId || undefined,
    traceId: payload.traceId || undefined,
    sourceLanguage: payload.sourceLanguage || '',
    targetLanguage: payload.targetLanguage || '',
    requestType: payload.requestType || '',
    providerId: payload.providerId || '',
    model: payload.model || '',
    pluginVersion: payload.pluginVersion || '',
    contractVersion: payload.contractVersion || '',
    interface: payload.interface || '',
    metadata: payload.metadata || {},
    segments: Array.isArray(payload.segments) ? payload.segments : [],
    ...payload,
  };
}

function buildDesktopVersionPayload(config, litellmManager) {
  const advancedMt = normalizeAdvancedConfig(config?.interfaces?.mt?.advanced, {
    maxBatchSegments: config?.interfaces?.mt?.maxBatchSegments || 8,
  });
  return {
    productName: PRODUCT_NAME,
    desktopVersion: VERSION,
    contractVersion: CONTRACT_VERSION,
    host: config.host || DEFAULT_HOST,
    port: config.port || DEFAULT_PORT,
    routes: ROUTES,
    interfaces: {
      mt: config.interfaces?.mt?.enabled ?? false,
      tm: config.interfaces?.tm?.enabled ?? false,
      tb: config.interfaces?.tb?.enabled ?? false,
      qa: config.interfaces?.qa?.enabled ?? false,
    },
    mt: {
      maxBatchSegments: Math.max(Number(config.interfaces?.mt?.maxBatchSegments || 1), 1),
      requestTimeoutMs: Number(config.interfaces?.mt?.requestTimeoutMs || 120000),
      capabilities: {
        requestTypePolicy: true,
        batching: true,
        promptTemplates: Array.isArray(advancedMt?.prompts?.templates) && advancedMt.prompts.templates.length > 0,
        glossary: true,
        summary: true,
        context: true,
        tmInjection: true,
        retry: true,
        cache: true,
      },
    },
    litellm: litellmManager.getStatus(),
  };
}

function validateContractVersion(payload) {
  const requested = safeValue(payload?.contractVersion);
  if (requested === CONTRACT_VERSION) return null;

  return {
    statusCode: 409,
    code: ERROR_CODES.contractVersionMismatch,
    message: requested
      ? `Plugin contract version ${requested} is incompatible with desktop contract version ${CONTRACT_VERSION}.`
      : `The memoQ plugin did not send a contract version. Desktop contract version ${CONTRACT_VERSION} is required.`,
  };
}

function buildContractMismatchResponse(payload, validation) {
  return {
    requestId: safeValue(payload?.requestId || crypto.randomUUID()),
    traceId: safeValue(payload?.traceId || crypto.randomUUID()),
    success: false,
    error: {
      code: validation.code,
      message: validation.message,
    },
    productName: PRODUCT_NAME,
    desktopVersion: VERSION,
    contractVersion: CONTRACT_VERSION,
  };
}

function createInputGuard() {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({
        requestId: req?.body?.requestId || crypto.randomUUID(),
        traceId: req?.body?.traceId || crypto.randomUUID(),
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Request body must be an object.' },
      });
      return;
    }

    req.body = sanitizePayload(req.body);
    next();
  };
}

function createRequestContext(payload, interfaceName, logConfig, startAt) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const metadata = payload?.metadata || {};
  const rawPayload = JSON.stringify(payload || {});
  const sanitizedPayload = buildPayloadForLog(payload, logConfig);
  return {
    requestId: safeValue(payload?.requestId || crypto.randomUUID()),
    traceId: safeValue(payload?.traceId || crypto.randomUUID()),
    interfaceName,
    requestType: safeValue(payload?.requestType),
    providerId: safeValue(payload?.providerId),
    model: safeValue(payload?.model),
    sourceLang: safeValue(payload?.sourceLanguage),
    targetLang: safeValue(payload?.targetLanguage),
    projectId: safeValue(metadata?.projectId || metadata?.projectGuid || metadata?.project_id || metadata?.ProjectId || metadata?.ProjectGuid),
    documentId: safeValue(metadata?.documentId || metadata?.documentGuid || metadata?.document_id || metadata?.DocumentId),
    segmentHashes: JSON.stringify(Array.isArray(segments) ? segments.map((segment, index) => segmentFingerprint(segment, index)) : []),
    requestPayloadBytes: bytesOf(rawPayload),
    responsePayloadBytes: 0,
    status: 1,
    elapsedMs: Math.max(Date.now() - startAt, 0),
    segmentCount: segments.length,
    requestPayload: JSON.stringify(logConfig?.storeRawPayload ? payload : sanitizedPayload),
    responsePayload: '',
    errorCode: '',
    errorMessage: '',
    createdAt: new Date().toISOString(),
  };
}

function finalizeErrorRecord(record, payload, logConfig, error, interfaceCode) {
  const code = interfaceCode || 'UNKNOWN_ERROR';
  const body = {
    requestId: record.requestId,
    traceId: record.traceId,
    success: false,
    error: {
      code,
      message: String(error && error.message ? error.message : error || 'unknown error'),
    },
  };
  const responseText = JSON.stringify(body);
  if (!record.requestPayload) {
    record.requestPayload = JSON.stringify(buildPayloadForLog(payload, logConfig));
  }
  record.responsePayload = responseText;
  record.responsePayloadBytes = bytesOf(responseText);
  record.errorCode = safeValue(code);
  record.errorMessage = safeValue(body?.error?.message);
  record.status = 1;
  record.elapsedMs = Math.max(record.elapsedMs, 0);
  return body;
}

function summarizeSuccessResponse(responseBody, interfaceName) {
  return {
    requestId: responseBody.requestId,
    interface: interfaceName,
    success: true,
    resultCount: responseBody.translations ? responseBody.translations.length : (responseBody.hits ? responseBody.hits.length : (responseBody.terms ? responseBody.terms.length : responseBody.issues ? responseBody.issues.length : 0)),
  };
}

function finalizeSuccessRecord(record, requestPayloadForRecord, payload, interfaceName, providerId, model, responseBody, logConfig) {
  const responseSummary = summarizeSuccessResponse(responseBody, interfaceName);
  const responseText = JSON.stringify(
    logConfig?.storeRawPayload ? responseBody : responseSummary
  );
  record.providerId = safeValue(providerId);
  record.model = safeValue(model);
  record.requestPayload = JSON.stringify(buildPayloadForLog(requestPayloadForRecord || payload, logConfig));
  record.responsePayload = responseText;
  record.responsePayloadBytes = bytesOf(responseText);
  record.errorCode = '';
  record.errorMessage = '';
  record.status = 0;
  record.elapsedMs = Math.max(Date.now() - new Date(record.createdAt).getTime(), 0);
}

function buildInterfaceConfigPayload(config) {
  return sanitizeConfigForClient(config);
}

function parseDateFilter(value) {
  if (!value) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return undefined;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function buildErrorResponse(code, requestId, traceId, message) {
  return {
    requestId,
    traceId,
    success: false,
    error: { code, message: String(message || 'unknown') },
  };
}

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 100;
  if (parsed < MIN_LIMIT) return MIN_LIMIT;
  if (parsed > MAX_LIMIT) return MAX_LIMIT;
  return parsed;
}

function parseOffset(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(parsed, 0);
}

function hydrateRuntimeConfig(config) {
  const cloned = JSON.parse(JSON.stringify(config || {}));
  const mtProviders = Array.isArray(cloned?.interfaces?.mt?.providers) ? cloned.interfaces.mt.providers : [];
  cloned.interfaces.mt.providers = mtProviders.map((provider) => ({
    ...provider,
    apiKey: getProviderSecret(provider),
  }));
  return cloned;
}

async function buildMtProviderHealth(config, litellmManager) {
  const runtimeConfig = hydrateRuntimeConfig(config);
  const providers = Array.isArray(runtimeConfig?.interfaces?.mt?.providers) ? runtimeConfig.interfaces.mt.providers : [];
  const litellmStatus = litellmManager.getStatus();
  const probe = createActiveProviderProbe();
  const items = [];

  for (const provider of providers) {
    items.push(await checkMtProviderHealth(provider, {
      apiKey: provider.apiKey || '',
      runtimeConfig,
      litellmStatus,
      probe,
    }));
  }

  return {
    items,
    summary: summarizeProviderHealth(items),
  };
}

async function createGatewayServer() {
  const app = express();
  app.use(bodyParser.json({ limit: '20mb' }));
  app.use(bodyParser.urlencoded({ extended: false }));

  const { db } = createDb();
  initSchema(db);

  let config = loadConfig();
  const migration = migrateLegacyProviderSecrets(config);
  if (migration.changed) {
    config = migration.config;
    saveConfig(config);
  }
  const mtRuntime = createMtRuntime();
  let mtRuntimeControls = createMtRuntimeControls({
    maxConcurrency: config.interfaces?.mt?.advanced?.runtime?.maxConcurrency || 1,
    requestsPerSecond: config.interfaces?.mt?.advanced?.runtime?.requestsPerSecond || 0,
  });
  const litellmManager = createLiteLLMManager({
    runtimeDir: path.join(process.env.APPDATA || process.cwd(), 'memoq-ai-gateway', 'litellm'),
  });
  litellmManager.applyConfig(hydrateRuntimeConfig(config));
  deleteExpiredLogs(db, Number(config?.log?.retentionDays));
  const cleanupTimer = setInterval(() => {
    try {
      deleteExpiredLogs(db, Number(config?.log?.retentionDays));
    } catch (_err) {
      // keep service alive when retention cleanup fails
    }
  }, 60 * 60 * 1000);

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      productName: PRODUCT_NAME,
      timestamp: new Date().toISOString(),
      version: VERSION,
      contractVersion: CONTRACT_VERSION,
      interfaces: {
        mt: config.interfaces?.mt?.enabled ?? false,
        tm: config.interfaces?.tm?.enabled ?? false,
        tb: config.interfaces?.tb?.enabled ?? false,
        qa: config.interfaces?.qa?.enabled ?? false,
      },
      litellm: litellmManager.getStatus(),
      mtRuntime: mtRuntimeControls.getStatus(),
      retentionDays: config.log?.retentionDays ?? 30,
    });
  });

  app.get('/admin/providers/health', async (req, res) => {
    res.json(await buildMtProviderHealth(config, litellmManager));
  });

  app.get(ROUTES.desktopVersion, (req, res) => {
    res.json(buildDesktopVersionPayload(config, litellmManager));
  });

  app.get(ROUTES.integrationStatus, (req, res) => {
    res.json(getIntegrationStatus({
      serviceDir: __dirname,
      integrationConfig: config.integration,
    }));
  });

  app.post(ROUTES.integrationInstall, (req, res) => {
    try {
      res.json({
        ok: true,
        status: installIntegration({
          serviceDir: __dirname,
          integrationConfig: config.integration,
        }),
      });
    } catch (error) {
      const statusCode = error instanceof IntegrationError ? error.statusCode : 500;
      const errorCode = error instanceof IntegrationError ? error.code : ERROR_CODES.integrationNotInstalled;
      res.status(statusCode).json(buildErrorResponse(errorCode, crypto.randomUUID(), crypto.randomUUID(), error.message));
    }
  });

  app.post(ROUTES.integrationRepair, (req, res) => {
    try {
      res.json({
        ok: true,
        status: installIntegration({
          serviceDir: __dirname,
          integrationConfig: config.integration,
        }),
      });
    } catch (error) {
      const statusCode = error instanceof IntegrationError ? error.statusCode : 500;
      const errorCode = error instanceof IntegrationError ? error.code : ERROR_CODES.integrationNotInstalled;
      res.status(statusCode).json(buildErrorResponse(errorCode, crypto.randomUUID(), crypto.randomUUID(), error.message));
    }
  });

  app.get('/admin/config', (req, res) => {
    res.json(buildInterfaceConfigPayload(config));
  });

  app.post('/admin/config', (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({
        error: 'invalid config payload',
      });
      return;
    }
    config = mergeAdminConfig(config, req.body || {});
    saveConfig(config);
    litellmManager.applyConfig(hydrateRuntimeConfig(config));
    mtRuntimeControls = createMtRuntimeControls({
      maxConcurrency: config.interfaces?.mt?.advanced?.runtime?.maxConcurrency || 1,
      requestsPerSecond: config.interfaces?.mt?.advanced?.runtime?.requestsPerSecond || 0,
    });
    deleteExpiredLogs(db, Number(config?.log?.retentionDays));
    res.json({ ok: true, config: buildInterfaceConfigPayload(config) });
  });

  app.get('/admin/config/secrets/:providerId', (req, res) => {
    const providerId = req.params.providerId;
    const provider = (config.interfaces?.mt?.providers || []).find((item) => item?.id === providerId);
    if (!provider) {
      res.status(404).json({ error: 'provider not found' });
      return;
    }
    if (!hasProviderSecret(provider)) {
      res.status(404).json({ error: 'api key not set' });
      return;
    }

    const apiKey = getProviderSecret(provider);
    if (!apiKey) {
      res.status(410).json({ error: 'api key decode failed' });
      return;
    }

    res.json({ apiKey, providerId });
  });

  app.post('/admin/config/secrets/:providerId', createInputGuard(), (req, res) => {
    const providerId = req.params.providerId;
    const provider = (config.interfaces?.mt?.providers || []).find((item) => item?.id === providerId);
    if (!provider) {
      res.status(404).json({ error: 'provider not found' });
      return;
    }

    const apiKey = req.body?.apiKey;
    if (!apiKey) {
      res.status(400).json({ error: 'apiKey missing' });
      return;
    }

    const secretInfo = setProviderSecret(providerId, String(apiKey), provider.secretRef);
    provider.secretRef = secretInfo.secretRef;
    provider.apiKeyProvidedAt = secretInfo.providedAt;
    saveConfig(config);
    litellmManager.applyConfig(hydrateRuntimeConfig(config));
    res.json({ ok: true });
  });

  app.get('/logs', async (req, res) => {
    const q = {
      interfaceName: req.query.interface,
      requestType: req.query.requestType,
      providerId: req.query.provider,
      model: req.query.model,
      requestId: req.query.requestId,
      segmentHash: req.query.segmentHash || req.query.segment,
      keyword: req.query.keyword,
      documentId: req.query.documentId,
      projectId: req.query.projectId,
      status: req.query.status,
      start: parseDateFilter(req.query.start),
      end: parseDateFilter(req.query.end),
      limit: parseLimit(req.query.limit),
      offset: parseOffset(req.query.offset),
    };

    const items = await queryLogs(db, q);
    const includePayload = req.query.includePayload === '1' || req.query.includePayload === 'true';
    const rows = items.map((item) => {
      if (includePayload) return item;
      const clone = { ...item };
      delete clone.requestPayload;
      delete clone.responsePayload;
      return clone;
    });

    res.json({
      total: rows.length,
      items: rows,
    });
  });

  app.get('/logs/:requestId', async (req, res) => {
    const requestId = req.params.requestId;
    const items = await queryLogs(db, {
      requestId,
      limit: 1,
      offset: 0,
    });

    if (!items.length) {
      res.status(404).json({ error: 'request not found' });
      return;
    }

    res.json({
      items,
      total: items.length,
    });
  });

  app.post('/mt/translate', createInputGuard(), async (req, res) => {
    if (!config.interfaces?.mt?.enabled) {
      res.status(503).json(buildErrorResponse('MT_DISABLED', req.body.requestId || crypto.randomUUID(), req.body.traceId || crypto.randomUUID(), 'MT interface disabled by config.'));
      return;
    }

    const start = Date.now();
    const payload = req.body;
    const contractValidation = validateContractVersion(payload);
    if (contractValidation) {
      res.status(contractValidation.statusCode).json(buildContractMismatchResponse(payload, contractValidation));
      return;
    }
    const record = createRequestContext(payload, 'mt', config.log, start);

    try {
      const configMt = config.interfaces?.mt || {};
      const maxBatch = Math.max(Number(configMt.maxBatchSegments || 8), 1);
      const segments = Array.isArray(payload.segments) ? payload.segments : [];

      if (segments.length > maxBatch) {
        throw new Error(`batch size exceeded: ${segments.length} > ${maxBatch}`);
      }
      if (!payload.sourceLanguage || !payload.targetLanguage) {
        throw new Error('sourceLanguage and targetLanguage are required');
      }

      const resolvedSelection = resolveMtProviderSelection(configMt, payload);
      const provider = resolvedSelection?.provider;
      if (!provider || !provider.id) {
        const providerError = new Error('No desktop provider is configured.');
        providerError.interfaceCode = ERROR_CODES.providerNotConfigured;
        throw providerError;
      }

      const resolvedPayload = {
        ...payload,
        providerId: resolvedSelection.providerId,
        model: resolvedSelection.model,
      };

      const providerApiKey = provider.apiKey || getProviderSecret(provider);
      const advancedMt = normalizeAdvancedConfig(configMt.advanced, {
        maxBatchSegments: maxBatch,
      });
      const orchestrationResult = await translateMtRequest(resolvedPayload, advancedMt, {
        runtime: mtRuntime,
        requestTimeoutMs: Number(configMt.requestTimeoutMs || 120000),
        translateBatch: async (batchPayload) => mtRuntimeControls.schedule(async () => (
          await translateWithProvider(batchPayload, provider, providerApiKey, config)
        )),
      });
      const translations = orchestrationResult.translations;
      if (!Array.isArray(translations) || translations.length !== segments.length) {
        throw new Error('invalid translation result');
      }

      const body = {
        requestId: record.requestId,
        traceId: record.traceId,
        interface: 'mt',
        success: true,
        providerId: resolvedPayload.providerId,
        model: resolvedPayload.model,
        batches: orchestrationResult.batches,
        cacheHit: orchestrationResult.cacheHit,
        translations,
        results: translations.map((translation, index) => ({
          index,
          ok: true,
          translation,
          errorMessage: '',
        })),
      };

      finalizeSuccessRecord(record, resolvedPayload, payload, 'mt', body.providerId, body.model, body, config.log);
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.json(body);
    } catch (error) {
      const body = finalizeErrorRecord(record, payload, config.log, error, error.interfaceCode || ERROR_CODES.translationFailed);
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.status(500).json(body);
    }
  });

  app.post('/tm/lookup', createInputGuard(), (req, res) => {
    if (!config.interfaces?.tm?.enabled) {
      res.status(503).json(buildErrorResponse('TM_DISABLED', req.body.requestId || crypto.randomUUID(), req.body.traceId || crypto.randomUUID(), 'TM interface disabled by config.'));
      return;
    }

    const start = Date.now();
    const payload = req.body;
    const record = createRequestContext(payload, 'tm', config.log, start);

    try {
      const hits = tmLookup(payload);
      const body = {
        requestId: record.requestId,
        traceId: record.traceId,
        interface: 'tm',
        success: true,
        providerId: safeValue(payload.providerId),
        model: safeValue(payload.model),
        hits,
      };

      finalizeSuccessRecord(record, payload, payload, 'tm', body.providerId, body.model, body, config.log);
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.json(body);
    } catch (error) {
      const body = finalizeErrorRecord(record, payload, config.log, error, 'TM_FAILED');
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.status(500).json(body);
    }
  });

  app.post('/tb/search', createInputGuard(), (req, res) => {
    if (!config.interfaces?.tb?.enabled) {
      res.status(503).json(buildErrorResponse('TB_DISABLED', req.body.requestId || crypto.randomUUID(), req.body.traceId || crypto.randomUUID(), 'TB interface disabled by config.'));
      return;
    }

    const start = Date.now();
    const payload = req.body;
    const record = createRequestContext(payload, 'tb', config.log, start);

    try {
      const terms = tbLookup(payload);
      const body = {
        requestId: record.requestId,
        traceId: record.traceId,
        interface: 'tb',
        success: true,
        providerId: safeValue(payload.providerId),
        model: safeValue(payload.model),
        terms,
      };

      finalizeSuccessRecord(record, payload, payload, 'tb', body.providerId, body.model, body, config.log);
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.json(body);
    } catch (error) {
      const body = finalizeErrorRecord(record, payload, config.log, error, 'TB_FAILED');
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.status(500).json(body);
    }
  });

  app.post('/qa/check', createInputGuard(), (req, res) => {
    if (!config.interfaces?.qa?.enabled) {
      res.status(503).json(buildErrorResponse('QA_DISABLED', req.body.requestId || crypto.randomUUID(), req.body.traceId || crypto.randomUUID(), 'QA interface disabled by config.'));
      return;
    }

    const start = Date.now();
    const payload = req.body;
    const record = createRequestContext(payload, 'qa', config.log, start);

    try {
      const issues = qaCheck(payload);
      const body = {
        requestId: record.requestId,
        traceId: record.traceId,
        interface: 'qa',
        success: true,
        providerId: safeValue(payload.providerId),
        model: safeValue(payload.model),
        issues,
      };

      finalizeSuccessRecord(record, payload, payload, 'qa', body.providerId, body.model, body, config.log);
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.json(body);
    } catch (error) {
      const body = finalizeErrorRecord(record, payload, config.log, error, 'QA_FAILED');
      record.elapsedMs = Math.max(Date.now() - start, 0);
      insertLog(db, record);
      res.status(500).json(body);
    }
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return {
    app,
    db,
    getConfig: () => config,
    setConfig: (next) => {
      config = mergeAdminConfig(config, next || {});
      litellmManager.applyConfig(hydrateRuntimeConfig(config));
      mtRuntimeControls = createMtRuntimeControls({
        maxConcurrency: config.interfaces?.mt?.advanced?.runtime?.maxConcurrency || 1,
        requestsPerSecond: config.interfaces?.mt?.advanced?.runtime?.requestsPerSecond || 0,
      });
      return config;
    },
    cleanup: () => {
      clearInterval(cleanupTimer);
      litellmManager.stop();
    },
  };
}

module.exports = {
  createGatewayServer,
  pickProvider,
};

if (require.main === module) {
  (async () => {
    const { app } = await createGatewayServer();
    const config = loadConfig();
    app.listen(config.port, config.host, () => {
      console.log(`memoQ AI Gateway is running at http://${config.host}:${config.port}`);
    });
  })();
}
