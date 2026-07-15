/**
 * server.js — lightweight REST API for Pini Family Tree.
 *
 * Data is persisted as JSON files inside the Docker volume mounted at DATA_DIR
 * (default: /data).
 *
 * Layout:
 *   /data/meta.json          — { vaults: ["1","2",…], activeVault: "101" }
 *   /data/vault-{number}.json — { persons: […], couples: […], siblingGroups: […] }
 *
 * Endpoints
 *   GET  /api/vaults           → { vaults, activeVault }
 *   POST /api/vaults           → { created: true/false }   body: { vaultNumber }
 *   GET  /api/active-vault     → { activeVault }
 *   PUT  /api/active-vault     → { ok: true }              body: { vaultNumber }
 *   GET  /api/vault/:id        → { persons, couples, siblingGroups }
 *   PUT  /api/vault/:id        → { ok: true }              body: { persons, couples, siblingGroups }
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const PORT     = Number(process.env.PORT) || 3000;

/* ── File helpers ────────────────────────────────────────────── */

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function metaFile() {
  return path.join(DATA_DIR, 'meta.json');
}

function vaultFile(id) {
  return path.join(DATA_DIR, `vault-${id}.json`);
}

/** Validate vault ID: only digits, 1-9999. */
function isValidVaultId(id) {
  return /^\d{1,4}$/.test(id) && Number(id) >= 1 && Number(id) <= 9999;
}

function readMeta() {
  try {
    const raw = fs.readFileSync(metaFile(), 'utf8');
    const m   = JSON.parse(raw);
    return {
      vaults:      Array.isArray(m.vaults) ? m.vaults : [],
      activeVault: m.activeVault || null
    };
  } catch (_) {
    return { vaults: [], activeVault: null };
  }
}

function writeMeta(meta) {
  fs.writeFileSync(metaFile(), JSON.stringify(meta, null, 2));
}

function readVault(id) {
  try {
    const raw = fs.readFileSync(vaultFile(id), 'utf8');
    const d   = JSON.parse(raw);
    return {
      persons:       Array.isArray(d.persons)       ? d.persons       : [],
      couples:       Array.isArray(d.couples)       ? d.couples       : [],
      siblingGroups: Array.isArray(d.siblingGroups) ? d.siblingGroups : []
    };
  } catch (_) {
    return { persons: [], couples: [], siblingGroups: [] };
  }
}

function writeVault(id, data) {
  fs.writeFileSync(vaultFile(id), JSON.stringify(data, null, 2));
}

/* ── HTTP helpers ────────────────────────────────────────────── */

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end',  () => {
      try   { resolve(JSON.parse(body || '{}')); }
      catch (_) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/* ── Request router ──────────────────────────────────────────── */

const VAULT_ID_RE = /^\/api\/vault\/(\d{1,4})$/;

async function handleRequest(req, res) {
  const { method, url } = req;

  // OPTIONS pre-flight (for local dev without nginx proxy)
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/vaults
  if (method === 'GET' && url === '/api/vaults') {
    send(res, 200, readMeta());
    return;
  }

  // POST /api/vaults
  if (method === 'POST' && url === '/api/vaults') {
    const body = await readBody(req);
    const num  = String(body.vaultNumber || '');
    if (!isValidVaultId(num)) {
      send(res, 400, { error: 'Invalid vault number' });
      return;
    }
    const meta  = readMeta();
    const isNew = !meta.vaults.includes(num);
    if (isNew) {
      meta.vaults.push(num);
      meta.vaults.sort((a, b) => Number(a) - Number(b));
      writeMeta(meta);
    }
    send(res, 200, { created: isNew });
    return;
  }

  // GET /api/active-vault
  if (method === 'GET' && url === '/api/active-vault') {
    send(res, 200, { activeVault: readMeta().activeVault });
    return;
  }

  // PUT /api/active-vault
  if (method === 'PUT' && url === '/api/active-vault') {
    const body = await readBody(req);
    const num  = String(body.vaultNumber || '');
    if (!isValidVaultId(num)) {
      send(res, 400, { error: 'Invalid vault number' });
      return;
    }
    const meta = readMeta();
    meta.activeVault = num;
    writeMeta(meta);
    send(res, 200, { ok: true });
    return;
  }

  // GET /api/vault/:id
  const vaultMatch = url.match(VAULT_ID_RE);
  if (vaultMatch) {
    const id = vaultMatch[1];
    if (method === 'GET') {
      send(res, 200, readVault(id));
      return;
    }
    if (method === 'PUT') {
      const body = await readBody(req);
      writeVault(id, {
        persons:       Array.isArray(body.persons)       ? body.persons       : [],
        couples:       Array.isArray(body.couples)       ? body.couples       : [],
        siblingGroups: Array.isArray(body.siblingGroups) ? body.siblingGroups : []
      });
      send(res, 200, { ok: true });
      return;
    }
  }

  send(res, 404, { error: 'Not found' });
}

/* ── Server startup ──────────────────────────────────────────── */

ensureDataDir();

http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('Request error:', err.message);
    if (!res.headersSent) send(res, 500, { error: 'Internal server error' });
  }
}).listen(PORT, () => {
  console.log(`Pini Family Tree API listening on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
