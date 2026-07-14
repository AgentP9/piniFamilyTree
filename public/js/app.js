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

/* ── App state ────────────────────────────────────────────── */
let data = Storage.load();
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

/* ── Toast notification ───────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 2800);
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
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return null;
}

function partnerPlaceholder(requiredGender) {
  const label = requiredGender ? requiredGender.charAt(0).toUpperCase() + requiredGender.slice(1) : '';
  return requiredGender
    ? `— Select ${label} dweller —`
    : '— Select dweller —';
}

/* ── Persist & refresh ────────────────────────────────────── */
function save() {
  Storage.save(data);
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
      ${p.gender === 'male' ? '♂' : '♀'} ${escapeHtml(p.name)}
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
  populatePersonSelect(childPersonSel);
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
    opt.textContent = `${p.gender === 'male' ? '♂' : '♀'} ${p.name}`;
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
    showToast('A couple must have one male and one female dweller', 'error');
    return;
  }

  const duplicate = data.couples.find(
    (c) => (c.person1Id === p1 && c.person2Id === p2) ||
           (c.person1Id === p2 && c.person2Id === p1)
  );
  if (duplicate) { showToast('This couple already exists', 'error'); return; }

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
document.addEventListener('click', (e) => {
  const delPersonId = e.target.dataset.deletePerson;
  if (delPersonId) {
    data.persons = data.persons.filter((p) => p.id !== delPersonId);
    // Remove from all couples
    data.couples = data.couples.filter(
      (c) => c.person1Id !== delPersonId && c.person2Id !== delPersonId
    );
    // Remove from childIds
    data.couples.forEach((c) => {
      c.childIds = c.childIds.filter((cid) => cid !== delPersonId);
    });
    refresh();
    showToast('Person deleted');
    return;
  }

  const delCoupleId = e.target.dataset.deleteCouple;
  if (delCoupleId) {
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
  Storage.exportJSON(data);
  showToast('Exported family-tree.json', 'success');
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
clearBtn.addEventListener('click', () => {
  if (!confirm('Delete ALL people and couples? This cannot be undone.')) return;
  data = { persons: [], couples: [] };
  refresh();
  showToast('All data cleared');
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

/* ── PWA: Register service worker ─────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* silent */ });
}

/* ── Initial render ───────────────────────────────────────── */
refresh();
