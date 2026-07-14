/**
 * storage.js — persistent localStorage layer for the family tree.
 *
 * Schema:
 *   piniFamilyTree-vaults         : ["13","101","76", …]   // sorted list of vault numbers
 *   piniFamilyTree-activeVault    : "101"                  // last active vault
 *   piniFamilyTree-vault-{number} : { persons, couples }   // per-vault data
 *
 * Legacy key "piniFamilyTree" (single-vault era) is migrated to vault 101
 * on first load if no vault list exists yet.
 */

const _VAULT_LIST_KEY   = 'piniFamilyTree-vaults';
const _ACTIVE_VAULT_KEY = 'piniFamilyTree-activeVault';
const _LEGACY_KEY       = 'piniFamilyTree';

const Storage = (() => {

  /* ── Internal helpers ─────────────────────────────────────── */

  function _vaultDataKey(vaultNumber) {
    return `piniFamilyTree-vault-${vaultNumber}`;
  }

  function _saveVaultList(vaults) {
    localStorage.setItem(_VAULT_LIST_KEY, JSON.stringify(vaults));
  }

  /* ── Vault registry ───────────────────────────────────────── */

  /** Returns the sorted array of registered vault numbers (as strings). */
  function getVaults() {
    try {
      const raw = localStorage.getItem(_VAULT_LIST_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return [];
  }

  /**
   * Register a new vault number.  If it already exists this is a no-op.
   * Returns true when a new entry was added, false when it already existed.
   */
  function createVault(vaultNumber) {
    const vaults = getVaults();
    const num = String(vaultNumber);
    if (vaults.includes(num)) return false;
    vaults.push(num);
    vaults.sort((a, b) => Number(a) - Number(b));
    _saveVaultList(vaults);
    return true;
  }

  /** Returns the vault number (string) that was active in the last session, or null. */
  function getActiveVault() {
    return localStorage.getItem(_ACTIVE_VAULT_KEY);
  }

  /** Persist the currently active vault so it is restored on next load. */
  function setActiveVault(vaultNumber) {
    localStorage.setItem(_ACTIVE_VAULT_KEY, String(vaultNumber));
  }

  /**
   * One-time migration: if legacy data (stored under the old single-vault key)
   * exists and no vault list has been created yet, move that data to vault 101
   * and return '101'.  Returns null when no migration is necessary.
   */
  function migrateLegacyData() {
    if (getVaults().length > 0) return null; // already on the new schema
    try {
      const raw = localStorage.getItem(_LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.persons) || Array.isArray(parsed.couples)) {
          localStorage.setItem(_vaultDataKey('101'), raw);
          localStorage.removeItem(_LEGACY_KEY);
          createVault('101');
          setActiveVault('101');
          return '101';
        }
      }
    } catch (_) { /* ignore corrupt data */ }
    return null;
  }

  /* ── Data load / save ─────────────────────────────────────── */

  /** Load the data for a specific vault.  Returns { persons, couples }. */
  function load(vaultNumber) {
    try {
      const raw = localStorage.getItem(_vaultDataKey(vaultNumber));
      if (raw) {
        const d = JSON.parse(raw);
        return {
          persons: Array.isArray(d.persons) ? d.persons : [],
          couples: Array.isArray(d.couples) ? d.couples : []
        };
      }
    } catch (_) { /* ignore corrupt data */ }
    return { persons: [], couples: [] };
  }

  /** Persist the data object for a specific vault. */
  function save(vaultNumber, d) {
    try {
      localStorage.setItem(_vaultDataKey(vaultNumber), JSON.stringify(d));
    } catch (err) {
      console.warn('Unable to persist data to localStorage', err);
    }
  }

  /* ── Export / Import ──────────────────────────────────────── */

  function exportJSON(vaultNumber, d) {
    const payload = { vaultNumber: String(vaultNumber), persons: d.persons, couples: d.couples };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault-${vaultNumber}-family-tree.json`;
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
