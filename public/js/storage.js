/**
 * storage.js — persistent localStorage layer for the family tree.
 *
 * Schema:
 *   persons : [{ id, name, gender }]
 *   couples : [{ id, person1Id, person2Id, childIds[] }]
 */

const STORAGE_KEY = 'piniFamilyTree';

const Storage = (() => {
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        return {
          persons: Array.isArray(data.persons) ? data.persons : [],
          couples: Array.isArray(data.couples) ? data.couples : []
        };
      }
    } catch (_) { /* ignore corrupt data */ }
    return { persons: [], couples: [] };
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  function exportJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-tree.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data.persons) || !Array.isArray(data.couples)) {
            reject(new Error('Invalid file format'));
            return;
          }
          resolve(data);
        } catch (_) {
          reject(new Error('Could not parse JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  return { load, save, exportJSON, importJSON };
})();
