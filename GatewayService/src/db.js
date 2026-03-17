const path = require('path');
const fs = require('fs');
const readline = require('readline');

function createDb() {
  const dataDir = path.join(process.env.APPDATA || process.cwd(), 'memoq-ai-gateway');
  const logsDir = path.join(dataDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return {
    db: {
      dataDir,
      logsDir,
    },
  };
}

function initSchema() {}

function formatLogDate(dateLike) {
  const date = new Date(dateLike || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function resolveLogFile(store, dateLike) {
  return path.join(store.logsDir, `${formatLogDate(dateLike)}.ndjson`);
}

function deleteExpiredLogs(store, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const threshold = Date.now() - Math.floor(retentionDays) * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(store.logsDir)) return;

  fs.readdirSync(store.logsDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.ndjson$/i.test(name))
    .forEach((name) => {
      const stamp = `${name.slice(0, 10)}T00:00:00.000Z`;
      const parsed = new Date(stamp).getTime();
      if (Number.isFinite(parsed) && parsed < threshold) {
        fs.rmSync(path.join(store.logsDir, name), { force: true });
      }
    });
}

function normalizeLogItem(item) {
  const toStringOrEmpty = (value) => (value === undefined || value === null ? '' : String(value));
  const toIntegerOrZero = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.trunc(parsed);
  };
  const toIntegerOrOne = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.trunc(parsed);
  };

  return {
    requestId: toStringOrEmpty(item?.requestId),
    traceId: toStringOrEmpty(item?.traceId),
    interfaceName: toStringOrEmpty(item?.interfaceName),
    requestType: toStringOrEmpty(item?.requestType),
    providerId: toStringOrEmpty(item?.providerId),
    model: toStringOrEmpty(item?.model),
    sourceLanguage: toStringOrEmpty(item?.sourceLang || item?.sourceLanguage),
    targetLanguage: toStringOrEmpty(item?.targetLang || item?.targetLanguage),
    projectId: toStringOrEmpty(item?.projectId),
    documentId: toStringOrEmpty(item?.documentId),
    segmentHashes: toStringOrEmpty(item?.segmentHashes),
    errorCode: toStringOrEmpty(item?.errorCode),
    errorMessage: toStringOrEmpty(item?.errorMessage),
    requestPayloadBytes: toIntegerOrZero(item?.requestPayloadBytes),
    responsePayloadBytes: toIntegerOrZero(item?.responsePayloadBytes),
    status: toIntegerOrOne(item?.status),
    elapsedMs: toIntegerOrZero(item?.elapsedMs),
    segmentCount: toIntegerOrZero(item?.segmentCount),
    requestPayload: item?.requestPayload === undefined || item?.requestPayload === null ? '' : String(item.requestPayload),
    responsePayload: item?.responsePayload === undefined || item?.responsePayload === null ? '' : String(item.responsePayload),
    createdAt: item?.createdAt || new Date().toISOString(),
  };
}

function insertLog(store, item) {
  const normalized = normalizeLogItem(item);
  const targetFile = resolveLogFile(store, normalized.createdAt);
  try {
    fs.appendFileSync(targetFile, `${JSON.stringify(normalized)}\n`, 'utf8');
  } catch (error) {
    console.warn('Failed to persist request log, skip persistence:', {
      requestId: normalized.requestId,
      interfaceName: normalized.interfaceName,
      error: error && error.message ? String(error.message) : String(error),
    });
  }
}

function listLogFiles(store) {
  if (!fs.existsSync(store.logsDir)) {
    return [];
  }

  return fs.readdirSync(store.logsDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.ndjson$/i.test(name))
    .sort((left, right) => right.localeCompare(left))
    .map((name) => path.join(store.logsDir, name));
}

function pickCandidateFiles(store, q = {}) {
  const allFiles = listLogFiles(store);
  if (!allFiles.length) {
    return [];
  }

  const startDate = q.start ? formatLogDate(q.start) : '';
  const endDate = q.end ? formatLogDate(q.end) : '';

  return allFiles.filter((filePath) => {
    const stamp = path.basename(filePath, '.ndjson');
    if (startDate && stamp < startDate) return false;
    if (endDate && stamp > endDate) return false;
    return true;
  });
}

function buildKeywordFilter(keyword) {
  const needle = String(keyword || '').trim().toLowerCase();
  if (!needle) return null;

  return (item) => [
    item.requestId,
    item.traceId,
    item.interfaceName,
    item.requestType,
    item.providerId,
    item.model,
    item.projectId,
    item.documentId,
    item.segmentHashes,
    item.errorCode,
    item.errorMessage,
    item.requestPayload,
    item.responsePayload,
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

function matchesLogQuery(item, q = {}) {
  if (q.interfaceName && item.interfaceName !== q.interfaceName) return false;
  if (q.providerId && item.providerId !== q.providerId) return false;
  if (q.model && item.model !== q.model) return false;
  if (q.requestId && item.requestId !== q.requestId) return false;
  if (q.documentId && item.documentId !== q.documentId) return false;
  if (q.projectId && item.projectId !== q.projectId) return false;
  if (q.requestType && item.requestType !== q.requestType) return false;
  if (q.segmentHash && !String(item.segmentHashes || '').includes(String(q.segmentHash))) return false;
  if (q.start && item.createdAt < q.start) return false;
  if (q.end && item.createdAt > q.end) return false;
  if (q.status !== undefined && q.status !== null && q.status !== '') {
    const statusValue = String(q.status).trim().toLowerCase();
    let expected = null;
    if (/^\d+$/.test(statusValue)) {
      expected = Number.parseInt(statusValue, 10);
    } else if (statusValue === 'success' || statusValue === 'ok' || statusValue === 'succeeded') {
      expected = 0;
    } else if (statusValue === 'failed' || statusValue === 'error' || statusValue === 'failure') {
      expected = 1;
    }
    if ((expected === 0 || expected === 1) && Number(item.status) !== expected) {
      return false;
    }
  }

  const keywordFilter = buildKeywordFilter(q.keyword);
  if (keywordFilter && !keywordFilter(item)) return false;

  return true;
}

async function readLogFile(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  const items = [];

  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line));
      } catch (_error) {
        // Skip malformed lines and keep the remaining file readable.
      }
    }
  } finally {
    reader.close();
  }

  return items;
}

async function readLogsByDate(store, dateLike) {
  const targetFile = resolveLogFile(store, dateLike);
  if (!fs.existsSync(targetFile)) {
    return [];
  }
  return readLogFile(targetFile);
}

async function getRecentLogs(store, limit = 100) {
  return queryLogs(store, { limit, offset: 0 });
}

async function queryLogs(store, q = {}) {
  const limit = (() => {
    const parsed = parseInt(q.limit, 10);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(Math.min(parsed, 500), 1);
  })();
  const offset = (() => {
    const parsed = parseInt(q.offset, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(parsed, 0);
  })();

  const results = [];
  const candidateFiles = pickCandidateFiles(store, q);

  for (const filePath of candidateFiles) {
    const items = await readLogFile(filePath);
    items
      .filter((item) => matchesLogQuery(item, q))
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
      .forEach((item) => results.push(item));
  }

  results.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  return results.slice(offset, offset + limit);
}

module.exports = {
  createDb,
  initSchema,
  insertLog,
  deleteExpiredLogs,
  queryLogs,
  readLogsByDate,
  getRecentLogs,
};
