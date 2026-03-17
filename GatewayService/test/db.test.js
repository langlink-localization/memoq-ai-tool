const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('file log store appends daily ndjson logs and supports date, recent, and keyword queries', async () => {
  const originalAppData = process.env.APPDATA;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoq-log-store-'));
  process.env.APPDATA = tempDir;

  try {
    delete require.cache[require.resolve('../src/db')];
    const { createDb, insertLog, queryLogs, readLogsByDate, getRecentLogs } = require('../src/db');
    const { db } = createDb();

    insertLog(db, {
      requestId: 'req-1',
      interfaceName: 'mt',
      providerId: 'provider-a',
      requestType: 'translate',
      errorMessage: '',
      createdAt: '2026-03-16T10:00:00.000Z',
    });
    insertLog(db, {
      requestId: 'req-2',
      interfaceName: 'qa',
      providerId: 'provider-b',
      requestType: 'check',
      errorMessage: 'network timeout',
      createdAt: '2026-03-17T10:00:00.000Z',
    });

    const dayLogs = await readLogsByDate(db, '2026-03-17T12:00:00.000Z');
    const recent = await getRecentLogs(db, 1);
    const keyword = await queryLogs(db, { keyword: 'timeout', limit: 10, offset: 0 });

    assert.equal(dayLogs.length, 1);
    assert.equal(dayLogs[0].requestId, 'req-2');
    assert.equal(recent.length, 1);
    assert.equal(recent[0].requestId, 'req-2');
    assert.equal(keyword.length, 1);
    assert.equal(keyword[0].requestId, 'req-2');
  } finally {
    process.env.APPDATA = originalAppData;
    delete require.cache[require.resolve('../src/db')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
