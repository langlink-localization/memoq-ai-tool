const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SECRET_DIR = process.env.APPDATA || process.cwd();
const SECRET_PATH = path.join(SECRET_DIR, 'memoq-ai-gateway', 'gateway.secret');
const ALGO = 'aes-256-gcm';

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAesKey() {
  if (!fs.existsSync(SECRET_PATH)) {
    ensureDir(SECRET_PATH);
    const raw = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_PATH, raw.toString('hex'), 'utf8');
    return raw;
  }
  const raw = fs.readFileSync(SECRET_PATH, 'utf8');
  return Buffer.from(raw.trim(), 'hex');
}

function protect(text) {
  if (typeof text !== 'string' || text.length === 0) return '';

  if (process.platform === 'win32') {
    const dpapiValue = tryProtectWithDpapi(text);
    if (dpapiValue) return `dpapi:${dpapiValue}`;
  }

  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function unprotect(encrypted) {
  if (typeof encrypted !== 'string' || encrypted.length === 0) return '';

  try {
    if (encrypted.startsWith('dpapi:') && process.platform === 'win32') {
      const payload = encrypted.replace('dpapi:', '').trim();
      const plaintext = tryUnprotectWithDpapi(payload);
      if (plaintext) return plaintext;
    }

    const key = getAesKey();
    const parts = encrypted.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return plain.toString('utf8');
  } catch (_err) {
    return '';
  }
}

function hideForLog(text) {
  if (!text) return '';
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function tryProtectWithDpapi(text) {
  const script =
    '$plain = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[0]));\n' +
    '$bytes = [Text.Encoding]::UTF8.GetBytes($plain);\n' +
    '$encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);\n' +
    '[Convert]::ToBase64String($encrypted)';

  try {
    const base64 = Buffer.from(text, 'utf8').toString('base64');
    const output = execFileSync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
      base64,
    ], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const result = String(output || '').trim();
    return result;
  } catch (err) {
    return '';
  }
}

function tryUnprotectWithDpapi(encrypted) {
  const script =
    '$bytes = [Convert]::FromBase64String($args[0]);\n' +
    '$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);\n' +
    '[Text.Encoding]::UTF8.GetString($plain)';

  try {
    const output = execFileSync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
      encrypted,
    ], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return String(output || '').trim();
  } catch (err) {
    return '';
  }
}

module.exports = {
  protect,
  unprotect,
  hideForLog,
  isDpapiEnabled: process.platform === 'win32',
};
