/**
 * storage.js — API-backed persistent storage for the family tree.
 *
 * All data is stored server-side in a Docker volume via a REST API.
 * Every public method returns a Promise.
 *
 * API base: /api
 *   GET  /api/vaults            → { vaults: ["1",…], activeVault: "101" }
 *   POST /api/vaults            → { created: true/false }
 *   GET  /api/active-vault      → { activeVault }
 *   PUT  /api/active-vault      → { ok: true }
 *   GET  /api/vault/:id         → { persons, couples }
 *   PUT  /api/vault/:id         → { ok: true }
 */

const Storage = (() => {

  const API = '/api';

  /* ── Internal fetch helpers ───────────────────────────────── */

  async function _get(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json();
  }

  async function _post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API error ${res.status}: POST ${path}`);
    return res.json();
  }

  async function _put(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API error ${res.status}: PUT ${path}`);
    return res.json();
  }

  /* ── Vault registry ───────────────────────────────────────── */

  /** Returns the sorted array of registered vault numbers (as strings). */
  async function getVaults() {
    const meta = await _get('/vaults');
    return meta.vaults || [];
  }

  /**
   * Register a new vault number.
   * Returns true when a new entry was added, false when it already existed.
   */
  async function createVault(vaultNumber) {
    const result = await _post('/vaults', { vaultNumber });
    return result.created;
  }

  /** Returns the vault number (string) that was active in the last session, or null. */
  async function getActiveVault() {
    const result = await _get('/active-vault');
    return result.activeVault || null;
  }

  /** Persist the currently active vault so it is restored on next load. */
  async function setActiveVault(vaultNumber) {
    await _put('/active-vault', { vaultNumber });
  }

  /**
   * No-op: legacy localStorage migration is not applicable when data lives in
   * a Docker volume.  Always returns null.
   */
  async function migrateLegacyData() {
    return null;
  }

  /* ── Data load / save ─────────────────────────────────────── */

  /** Load the data for a specific vault.  Returns { persons, couples }. */
  async function load(vaultNumber) {
    try {
      return await _get(`/vault/${vaultNumber}`);
    } catch (_) {
      return { persons: [], couples: [] };
    }
  }

  /** Persist the data object for a specific vault. */
  async function save(vaultNumber, d) {
    await _put(`/vault/${vaultNumber}`, { persons: d.persons, couples: d.couples });
  }

  /* ── Export / Import ──────────────────────────────────────── */

  function exportJSON(vaultNumber, d) {
    const payload = { vaultNumber: String(vaultNumber), persons: d.persons, couples: d.couples };
    const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `vault-${vaultNumber}-family-tree.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const d = JSON.parse(e.target.result);
          if (!Array.isArray(d.persons) || !Array.isArray(d.couples)) {
            reject(new Error('Invalid file format'));
            return;
          }
          resolve(d);
        } catch (_) {
          reject(new Error('Could not parse JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  return {
    getVaults,
    createVault,
    getActiveVault,
    setActiveVault,
    migrateLegacyData,
    load,
    save,
    exportJSON,
    importJSON
  };
})();
