/**
 * app.js — main UI controller for Pini Family Tree PWA.
 *
 * Depends on: storage.js, mermaid-gen.js, mermaid (CDN global)
 */

/* ── Mermaid initialisation ───────────────────────────────── */
// Guard: if the CDN failed to load the mermaid global, the rest of the app
// (CRUD, persistence, lists) still works; the diagram area shows a warning.
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    flowchart: { curve: 'basis', useMaxWidth: true }
  });
}

const GENDER_MALE = 'male';
const GENDER_FEMALE = 'female';
const GENDER_LABELS = {
  [GENDER_MALE]: 'Male',
  [GENDER_FEMALE]: 'Female'
};

/* ── App state ────────────────────────────────────────────── */
let currentVault = null;
let data = { persons: [], couples: [] };
let renderCounter = 0; // unique IDs for mermaid.render()
let legacyIdCounter = 0;

/* ── DOM refs ─────────────────────────────────────────────── */
const addPersonForm    = document.getElementById('add-person-form');
const personNameInput  = document.getElementById('person-name');
const sidebar          = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const sidebarToggleLbl = document.getElementById('sidebar-toggle-label');
const createCoupleForm = document.getElementById('create-couple-form');
const couplePerson1Sel = document.getElementById('couple-person1');
const couplePerson2Sel = document.getElementById('couple-person2');
const addChildForm     = document.getElementById('add-child-form');
const childCoupleSel   = document.getElementById('child-couple');
const childPersonSel   = document.getElementById('child-person');
const fullscreenBtn    = document.getElementById('fullscreen-btn');

const personsList      = document.getElementById('persons-list');
const couplesList      = document.getElementById('couples-list');
const personsCount     = document.getElementById('persons-count');
const couplesCount     = document.getElementById('couples-count');

const mermaidDiagram   = document.getElementById('mermaid-diagram');
const mermaidCodePre   = document.getElementById('mermaid-code');
const copyMermaidBtn   = document.getElementById('copy-mermaid-btn');
const exportBtn        = document.getElementById('export-btn');
const importBtn        = document.getElementById('import-btn');
const importFile       = document.getElementById('import-file');
const clearBtn         = document.getElementById('clear-btn');
const toast            = document.getElementById('toast');
const confirmModal     = document.getElementById('confirm-modal');
const confirmModalMsg  = document.getElementById('confirm-modal-message');
const confirmModalOk   = document.getElementById('confirm-modal-confirm');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');

const vaultBadge       = document.getElementById('vault-badge');
const vaultModal       = document.getElementById('vault-modal');
const vaultListEl      = document.getElementById('vault-list');
const vaultCreateForm  = document.getElementById('vault-create-form');
const vaultNumberInput = document.getElementById('vault-number-input');
const vaultModalClose  = document.getElementById('vault-modal-close');

/* ── Toast notification ───────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 2800);
}

/* ── Confirm modal ────────────────────────────────────────── */
function showConfirm(message) {
  return new Promise((resolve) => {
    confirmModalMsg.textContent = message;
    confirmModal.classList.remove('hidden');
    confirmModalOk.focus();

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      confirmModalOk.removeEventListener('click', onOk);
      confirmModalCancel.removeEventListener('click', onCancel);
      confirmModal.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    const onOk      = () => cleanup(true);
    const onCancel  = () => cleanup(false);
    const onOverlay = (e) => { if (e.target === confirmModal) cleanup(false); };
    const onKey     = (e) => { if (e.key === 'Escape') cleanup(false); };

    confirmModalOk.addEventListener('click', onOk);
    confirmModalCancel.addEventListener('click', onCancel);
    confirmModal.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
  });
}

/* ── Helpers ──────────────────────────────────────────────── */
function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `id-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  legacyIdCounter += 1;
  return `id-${Date.now().toString(36)}-${legacyIdCounter.toString(36)}`;
}

function getPerson(id) {
  return data.persons.find((x) => x.id === id) || null;
}

function getPersonName(id) {
  const p = getPerson(id);
  return p ? p.name : '(unknown)';
}

function coupleName(couple) {
  return `${getPersonName(couple.person1Id)} ⚭ ${getPersonName(couple.person2Id)}`;
}

function oppositeGender(gender) {
  if (gender === GENDER_MALE) return GENDER_FEMALE;
  if (gender === GENDER_FEMALE) return GENDER_MALE;
  return null;
}

function partnerPlaceholder(requiredGender) {
  const label = requiredGender ? GENDER_LABELS[requiredGender] : '';
  return requiredGender
    ? `— Select ${label} dweller —`
    : '— Select dweller —';
}

/* ── Persist & refresh ────────────────────────────────────── */
function save() {
  Storage.save(currentVault, data).catch((err) => {
    console.warn('Failed to persist data:', err);
    showToast('Failed to save data to server', 'error');
  });
}

function refresh() {
  save();
  renderPersonsList();
  renderCouplesList();
  populateSelects();
  renderDiagram();
}

/* ── Persons list ─────────────────────────────────────────── */
function renderPersonsList() {
  personsCount.textContent = data.persons.length;
  personsList.innerHTML = '';
  if (data.persons.length === 0) {
    personsList.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">No people yet</span>';
    return;
  }
  data.persons.forEach((p) => {
    const chip = document.createElement('span');
    chip.className = `person-chip ${p.gender}`;
    chip.innerHTML = `
      ${p.gender === GENDER_MALE ? '♂' : '♀'} ${escapeHtml(p.name)}
      <button class="btn-icon" title="Delete ${escapeHtml(p.name)}" data-delete-person="${p.id}">✕</button>
    `;
    personsList.appendChild(chip);
  });
}

/* ── Couples list ─────────────────────────────────────────── */
function renderCouplesList() {
  couplesCount.textContent = data.couples.length;
  couplesList.innerHTML = '';
  if (data.couples.length === 0) {
    couplesList.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">No couples yet</span>';
    return;
  }
  data.couples.forEach((c) => {
    const chip = document.createElement('span');
    chip.className = 'couple-chip';
    const childCount = (c.childIds || []).length;
    chip.innerHTML = `
      ${escapeHtml(coupleName(c))}
      <span class="children-badge" title="${childCount} child(ren)">${childCount} 👶</span>
      <button class="btn-icon" title="Delete couple" data-delete-couple="${c.id}">✕</button>
    `;
    couplesList.appendChild(chip);
  });
}

/* ── Populate <select> elements ───────────────────────────── */
function populateSelects() {
  populateCouplePersonSelects();

  // Child dropdown: only free dwellers (not already a child, not in any couple)
  const childrenIds  = new Set(data.couples.flatMap((c) => c.childIds || []));
  const coupledIds   = new Set(data.couples.flatMap((c) => [c.person1Id, c.person2Id]));
  const occupiedIds  = new Set([...childrenIds, ...coupledIds]);
  populatePersonSelect(
    childPersonSel,
    (person) => !occupiedIds.has(person.id),
    '— Select dweller —'
  );

  populateCoupleSelect(childCoupleSel);
}

function populateCouplePersonSelects() {
  const person1 = getPerson(couplePerson1Sel.value);
  const person2 = getPerson(couplePerson2Sel.value);
  const person1RequiredGender = person2 ? oppositeGender(person2.gender) : null;
  const person2RequiredGender = person1 ? oppositeGender(person1.gender) : null;

  populatePersonSelect(
    couplePerson1Sel,
    (person) => !person1RequiredGender || person.gender === person1RequiredGender,
    partnerPlaceholder(person1RequiredGender)
  );
  populatePersonSelect(
    couplePerson2Sel,
    (person) => !person2RequiredGender || person.gender === person2RequiredGender,
    partnerPlaceholder(person2RequiredGender)
  );
}

function populatePersonSelect(sel, filterFn = () => true, placeholder = '— Select person —') {
  const current = sel.value;
  sel.innerHTML = '';

  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholder;
  sel.appendChild(placeholderOpt);

  const filteredPersons = data.persons.filter(filterFn);
  filteredPersons.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.gender === GENDER_MALE ? '♂' : '♀'} ${p.name}`;
    sel.appendChild(opt);
  });
  // Reset the selection when the current value is no longer valid under the
  // active gender filter so the form cannot keep a stale, incompatible pair.
  const hasCurrentOption = filteredPersons.some((person) => person.id === current);
  sel.value = hasCurrentOption ? current : '';
}

function populateCoupleSelect(sel) {
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select couple —</option>';
  data.couples.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = coupleName(c);
    sel.appendChild(opt);
  });
  sel.value = current;
}

/* ── Mermaid diagram ──────────────────────────────────────── */
async function renderDiagram() {
  const code = MermaidGen.generate(data);
  mermaidCodePre.textContent = code || '(empty)';

  if (!code) {
    mermaidDiagram.innerHTML = `
      <div class="empty-state">
        <p>🏠 Add dwellers and form couples to grow your vault family tree!</p>
      </div>`;
    return;
  }

  if (typeof mermaid === 'undefined') {
    mermaidDiagram.innerHTML = `
      <div class="empty-state">
        ⚠️ Diagram library not loaded — check your internet connection.<br>
        <small>The Mermaid source is still available below.</small>
      </div>`;
    return;
  }

  try {
    const id = `mermaid-svg-${++renderCounter}`;
    const { svg } = await mermaid.render(id, code);
    mermaidDiagram.innerHTML = svg;
  } catch (err) {
    mermaidDiagram.innerHTML = `<div class="empty-state" style="color:var(--danger)">Diagram error: ${escapeHtml(err.message)}</div>`;
  }
}

/* ── Family-graph helpers ─────────────────────────────────── */

/** Returns a Set of all ancestor IDs (parents, grandparents, …) of personId. */
function getAncestors(personId) {
  const ancestors = new Set();
  function walk(id) {
    if (ancestors.has(id)) return;
    ancestors.add(id);
    data.couples.forEach((c) => {
      if ((c.childIds || []).includes(id)) {
        walk(c.person1Id);
        walk(c.person2Id);
      }
    });
  }
  data.couples.forEach((c) => {
    if ((c.childIds || []).includes(personId)) {
      walk(c.person1Id);
      walk(c.person2Id);
    }
  });
  return ancestors;
}

/** Returns a Set of all descendant IDs (children, grandchildren, …) of personId. */
function getDescendants(personId) {
  const descendants = new Set();
  function walk(id) {
    if (descendants.has(id)) return;
    descendants.add(id);
    data.couples.forEach((c) => {
      if (c.person1Id === id || c.person2Id === id) {
        (c.childIds || []).forEach((childId) => walk(childId));
      }
    });
  }
  data.couples.forEach((c) => {
    if (c.person1Id === personId || c.person2Id === personId) {
      (c.childIds || []).forEach((childId) => walk(childId));
    }
  });
  return descendants;
}

/** Returns true if id1 and id2 share at least one parent couple. */
function areSiblings(id1, id2) {
  return data.couples.some(
    (c) => (c.childIds || []).includes(id1) && (c.childIds || []).includes(id2)
  );
}

/* ── XSS-safe HTML escaping ───────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── Event: Add person ────────────────────────────────────── */
addPersonForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = personNameInput.value.trim();
  if (!name) return;

  const gender = addPersonForm.querySelector('input[name="gender"]:checked').value;
  data.persons.push({ id: genId(), name, gender });
  personNameInput.value = '';
  refresh();
  showToast(`${name} added`, 'success');
});

/* ── Event: Create couple ─────────────────────────────────── */
createCoupleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const p1 = couplePerson1Sel.value;
  const p2 = couplePerson2Sel.value;
  const person1 = getPerson(p1);
  const person2 = getPerson(p2);

  if (!p1 || !p2) { showToast('Please select two people', 'error'); return; }
  if (p1 === p2)  { showToast('A person cannot be coupled with themselves', 'error'); return; }
  if (!person1 || !person2) { showToast('Please select two existing people', 'error'); return; }
  if (person1.gender === person2.gender) {
    showToast('Partner 1 and Partner 2 must be different genders. Please adjust your selection.', 'error');
    return;
  }

  const duplicate = data.couples.find(
    (c) => (c.person1Id === p1 && c.person2Id === p2) ||
           (c.person1Id === p2 && c.person2Id === p1)
  );
  if (duplicate) { showToast('This couple already exists', 'error'); return; }

  if (getAncestors(p1).has(p2) || getAncestors(p2).has(p1)) {
    showToast('Cannot form a couple between (grand-)parents and (grand-)children', 'error');
    return;
  }
  if (areSiblings(p1, p2)) {
    showToast('Cannot form a couple between siblings', 'error');
    return;
  }

  data.couples.push({ id: genId(), person1Id: p1, person2Id: p2, childIds: [] });
  createCoupleForm.reset();
  refresh();
  showToast('Couple created', 'success');
});

couplePerson1Sel.addEventListener('change', () => {
  populateCouplePersonSelects();
});

couplePerson2Sel.addEventListener('change', () => {
  populateCouplePersonSelects();
});

/* ── Event: Add child ─────────────────────────────────────── */
addChildForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const coupleId = childCoupleSel.value;
  const childId  = childPersonSel.value;

  if (!coupleId || !childId) { showToast('Please select a couple and a child', 'error'); return; }

  const couple = data.couples.find((c) => c.id === coupleId);
  if (!couple) return;

  if (couple.person1Id === childId || couple.person2Id === childId) {
    showToast('A parent cannot be their own child', 'error');
    return;
  }

  if (couple.childIds.includes(childId)) {
    showToast('This person is already a child of this couple', 'error');
    return;
  }

  couple.childIds.push(childId);
  addChildForm.reset();
  refresh();
  showToast(`${getPersonName(childId)} added as child`, 'success');
});

/* ── Event: Delete person / couple (delegated) ────────────── */
document.addEventListener('click', async (e) => {
  const delPersonId = e.target.dataset.deletePerson;
  if (delPersonId) {
    const personName = getPersonName(delPersonId);

    const isInCouple = data.couples.some(
      (c) => c.person1Id === delPersonId || c.person2Id === delPersonId
    );
    const isChild = data.couples.some(
      (c) => (c.childIds || []).includes(delPersonId)
    );
    if (isInCouple || isChild) {
      showToast(`Cannot delete "${personName}": dweller is part of a couple or registered as a child`, 'error');
      return;
    }

    if (!await showConfirm(`Are you sure you want to delete "${personName}"?`)) return;
    data.persons = data.persons.filter((p) => p.id !== delPersonId);
    refresh();
    showToast('Person deleted');
    return;
  }

  const delCoupleId = e.target.dataset.deleteCouple;
  if (delCoupleId) {
    if (!await showConfirm('Are you sure you want to delete this couple?')) return;
    data.couples = data.couples.filter((c) => c.id !== delCoupleId);
    refresh();
    showToast('Couple deleted');
  }
});

/* ── Event: Copy Mermaid code ─────────────────────────────── */
copyMermaidBtn.addEventListener('click', async () => {
  const code = mermaidCodePre.textContent;
  if (!code || code === '(empty)') { showToast('Nothing to copy', 'error'); return; }
  try {
    await navigator.clipboard.writeText(code);
    showToast('Mermaid code copied!', 'success');
  } catch (_) {
    showToast('Copy not supported in this browser', 'error');
  }
});

/* ── Event: Export ────────────────────────────────────────── */
exportBtn.addEventListener('click', () => {
  Storage.exportJSON(currentVault, data);
  showToast(`Exported vault-${currentVault}-family-tree.json`, 'success');
});

/* ── Event: Import ────────────────────────────────────────── */
importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    data = await Storage.importJSON(file);
    importFile.value = '';
    refresh();
    showToast('Data imported successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

/* ── Event: Clear all ─────────────────────────────────────── */
clearBtn.addEventListener('click', async () => {
  if (!await showConfirm('Delete ALL people and couples? This cannot be undone.')) return;
  data = { persons: [], couples: [] };
  refresh();
  showToast('All data cleared');
});

/* ── Event: Collapse / expand sections ────────────────────── */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-collapse');
  if (!btn) return;
  const target = document.getElementById(btn.dataset.collapseTarget);
  if (!target) return;
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  btn.title = expanded ? 'Expand' : 'Collapse';
  target.classList.toggle('is-collapsed', expanded);
  btn.closest('.card-header').classList.toggle('no-bottom-margin', expanded);
});

/* ── Event: Toggle sidebar ────────────────────────────────── */
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-hidden', collapsed);
  sidebar.hidden = collapsed;
  sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggleLbl.textContent = collapsed ? 'Show Sidebar' : 'Hide Sidebar';
}

sidebarToggleBtn.addEventListener('click', () => {
  setSidebarCollapsed(!document.body.classList.contains('sidebar-hidden'));
});

/* ── Event: Full screen for tree ─────────────────────────── */
const treeCard = fullscreenBtn.closest('.card');

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    treeCard.requestFullscreen().catch(() => {
      showToast('Fullscreen not supported in this browser', 'error');
    });
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  fullscreenBtn.innerHTML = isFs ? '✕ Exit Full Screen' : '⛶ Full Screen';
  fullscreenBtn.title = isFs ? 'Exit full screen' : 'View tree in full screen';
});

/* ── PWA: Register service worker ─────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* silent */ });
}

/* ── Vault picker ─────────────────────────────────────────── */

/** Switch to a vault: update badge, load its data, re-render. */
async function enterVault(vaultNumber) {
  currentVault = String(vaultNumber);
  vaultBadge.textContent = `VAULT ${currentVault}`;
  data = await Storage.load(currentVault);
  Storage.setActiveVault(currentVault).catch((err) => {
    console.warn('Failed to persist active vault:', err);
  });
}

async function openVaultPicker() {
  await renderVaultList();
  vaultModal.classList.remove('hidden');
  // Only allow closing when a vault is already active
  vaultModalClose.classList.toggle('hidden', !currentVault);
  vaultNumberInput.value = '';
  // Focus first vault button if available, otherwise the number input
  const firstVaultBtn = vaultListEl.querySelector('.vault-item');
  (firstVaultBtn || vaultNumberInput).focus();
}

function closeVaultPicker() {
  vaultModal.classList.add('hidden');
}

async function renderVaultList() {
  vaultListEl.innerHTML = '<p class="vault-empty">Loading…</p>';
  let vaults;
  try {
    vaults = await Storage.getVaults();
  } catch (_) {
    vaultListEl.innerHTML = '<p class="vault-empty" style="color:var(--danger)">Could not reach server.</p>';
    return;
  }
  vaultListEl.innerHTML = '';
  if (vaults.length === 0) {
    vaultListEl.innerHTML = '<p class="vault-empty">No vaults yet — create one below.</p>';
    return;
  }
  for (const num of vaults) {
    const vd  = await Storage.load(num);
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `vault-item${num === currentVault ? ' vault-item--active' : ''}`;
    btn.innerHTML = `
      <span class="vault-item-name">VAULT ${escapeHtml(num)}</span>
      <span class="vault-item-stats">${vd.persons.length} dweller${vd.persons.length !== 1 ? 's' : ''} · ${vd.couples.length} couple${vd.couples.length !== 1 ? 's' : ''}</span>
    `;
    btn.addEventListener('click', async () => {
      await enterVault(num);
      closeVaultPicker();
      refresh();
    });
    vaultListEl.appendChild(btn);
  }
}

vaultCreateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw    = vaultNumberInput.value.trim();
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < 1 || parsed > 9999) {
    showToast('Enter a whole vault number between 1 and 9999', 'error');
    return;
  }
  const vaultNum = String(parsed);
  try {
    const isNew = await Storage.createVault(vaultNum);
    await enterVault(vaultNum);
    closeVaultPicker();
    refresh();
    showToast(isNew ? `Welcome to Vault ${vaultNum}!` : `Entered Vault ${vaultNum}`, 'success');
  } catch (_) {
    showToast('Could not create vault — server unreachable', 'error');
  }
});

vaultBadge.addEventListener('click', () => openVaultPicker());

vaultModalClose.addEventListener('click', () => {
  if (currentVault) closeVaultPicker();
});

vaultModal.addEventListener('click', (e) => {
  if (e.target === vaultModal && currentVault) closeVaultPicker();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !vaultModal.classList.contains('hidden') && currentVault) {
    closeVaultPicker();
  }
});

/* ── Initial render ───────────────────────────────────────── */
(async function init() {
  const migrated = await Storage.migrateLegacyData();
  const active   = migrated || await Storage.getActiveVault();
  if (active) {
    await enterVault(active);
    refresh();
  } else {
    openVaultPicker();
  }
}());
