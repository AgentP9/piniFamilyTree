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
let data = { persons: [], couples: [], siblingGroups: [] };
let renderCounter = 0; // unique IDs for mermaid.render()
let legacyIdCounter = 0;
let selectedPersonId = null;
let selectedCoupleId = null;

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
const linkSiblingsForm  = document.getElementById('link-siblings-form');
const siblingPerson1Sel = document.getElementById('sibling-person1');
const siblingPerson2Sel = document.getElementById('sibling-person2');
const fullscreenBtn    = document.getElementById('fullscreen-btn');

const personsList      = document.getElementById('persons-list');
const couplesList      = document.getElementById('couples-list');
const siblingGroupsList = document.getElementById('sibling-groups-list');
const personsCount     = document.getElementById('persons-count');
const couplesCount     = document.getElementById('couples-count');
const siblingGroupsCount = document.getElementById('sibling-groups-count');

const mermaidDiagram   = document.getElementById('mermaid-diagram');
const mermaidCodePre   = document.getElementById('mermaid-code');
const copyMermaidBtn   = document.getElementById('copy-mermaid-btn');
const clearFocusBtn    = document.getElementById('clear-focus-btn');
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

/* ── Searchable selects ───────────────────────────────────── */
[couplePerson1Sel, couplePerson2Sel, childCoupleSel, childPersonSel,
  siblingPerson1Sel, siblingPerson2Sel].forEach((sel) => new SearchableSelect(sel));

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

function getCouple(id) {
  return data.couples.find((x) => x.id === id) || null;
}

function syncSelectionState() {
  if (selectedPersonId && !getPerson(selectedPersonId)) selectedPersonId = null;
  if (selectedCoupleId && !getCouple(selectedCoupleId)) selectedCoupleId = null;
}

function getRegisteredChildIds() {
  return new Set(data.couples.flatMap((couple) => couple.childIds || []));
}

function personInteractionClasses(personId) {
  const classes = [];
  const registeredChildIds = selectedCoupleId ? getRegisteredChildIds() : null;

  if (selectedPersonId) {
    if (personId === selectedPersonId) {
      classes.push('is-active');
    } else if (canFormCouple(selectedPersonId, personId)) {
      classes.push('is-eligible');
    } else {
      classes.push('is-dimmed');
    }
  } else if (selectedCoupleId) {
    const selectedCouple = getCouple(selectedCoupleId);
    if (!selectedCouple) return classes;
    if (personId === selectedCouple.person1Id || personId === selectedCouple.person2Id) {
      classes.push('is-active');
    } else if (canRegisterChild(selectedCoupleId, personId, registeredChildIds)) {
      classes.push('is-eligible');
    }
  }

  return classes;
}

/* ── Persist & refresh ────────────────────────────────────── */
function save() {
  Storage.save(currentVault, data).catch((err) => {
    console.warn('Failed to persist data:', err);
    showToast('Failed to save data to server', 'error');
  });
}

function renderView() {
  syncSelectionState();
  renderPersonsList();
  renderCouplesList();
  renderSiblingGroupsList();
  populateSelects();
  renderDiagram();
  clearFocusBtn.hidden = !selectedPersonId && !selectedCoupleId;
}

function refresh() {
  save();
  renderView();
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
    chip.className = `person-chip ${p.gender} ${personInteractionClasses(p.id).join(' ')}`.trim();
    chip.dataset.personId = p.id;
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-pressed', String(selectedPersonId === p.id));
    chip.innerHTML = `
      <span class="chip-label">${p.gender === GENDER_MALE ? '♂' : '♀'} ${escapeHtml(p.name)}</span>
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
    chip.className = `couple-chip${selectedCoupleId === c.id ? ' is-active' : ''}`;
    chip.dataset.coupleId = c.id;
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-pressed', String(selectedCoupleId === c.id));
    const childCount = (c.childIds || []).length;
    chip.innerHTML = `
      <span class="chip-label">${escapeHtml(coupleName(c))}</span>
      <span class="children-badge" title="${childCount} child(ren)">${childCount} 👶</span>
      <button class="btn-icon" title="Delete couple" data-delete-couple="${c.id}">✕</button>
    `;
    couplesList.appendChild(chip);
  });
}

/* ── Sibling groups list ──────────────────────────────────── */
function renderSiblingGroupsList() {
  const groups = data.siblingGroups || [];
  siblingGroupsCount.textContent = groups.length;
  siblingGroupsList.innerHTML = '';
  if (groups.length === 0) {
    siblingGroupsList.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">No sibling links yet</span>';
    return;
  }
  groups.forEach((g) => {
    const chip = document.createElement('span');
    chip.className = 'sibling-group-chip';
    const names = (g.personIds || []).map((id) => escapeHtml(getPersonName(id))).join(' 🤝 ');
    chip.innerHTML = `
      ${names}
      <button class="btn-icon" title="Remove sibling link" data-delete-sibling-group="${g.id}">✕</button>
    `;
    siblingGroupsList.appendChild(chip);
  });
}

/* ── Populate <select> elements ───────────────────────────── */
function populateSelects() {
  populateCouplePersonSelects();

  // Child dropdown: free dwellers (not already registered as a child of any couple).
  // Dwellers who are already in a couple ARE allowed — a person can be both a partner
  // in their own couple and a child of their parents' couple.
  const childrenIds = getRegisteredChildIds();
  populatePersonSelect(
    childPersonSel,
    (person) => !childrenIds.has(person.id),
    '— Select dweller —'
  );

  populateCoupleSelect(childCoupleSel);

  // Sibling dropdowns: all dwellers are eligible regardless of couple/child status
  populateSiblingPersonSelects();
}

function populateCouplePersonSelects() {
  const person1 = getPerson(couplePerson1Sel.value);
  const person2 = getPerson(couplePerson2Sel.value);
  const person1RequiredGender = person2 ? oppositeGender(person2.gender) : null;
  const person2RequiredGender = person1 ? oppositeGender(person1.gender) : null;

  // Pre-compute relationship sets to avoid redundant graph traversal per candidate
  const p1Ancestors   = person1 ? getAncestors(person1.id)   : new Set();
  const p1Descendants = person1 ? getDescendants(person1.id) : new Set();
  const p1Siblings    = person1 ? getSiblings(person1.id)    : new Set();
  const p2Ancestors   = person2 ? getAncestors(person2.id)   : new Set();
  const p2Descendants = person2 ? getDescendants(person2.id) : new Set();
  const p2Siblings    = person2 ? getSiblings(person2.id)    : new Set();

  populatePersonSelect(
    couplePerson1Sel,
    (person) => {
      if (person1RequiredGender && person.gender !== person1RequiredGender) return false;
      if (!person2) return true;
      return !p2Ancestors.has(person.id) &&
             !p2Descendants.has(person.id) &&
             !p2Siblings.has(person.id);
    },
    partnerPlaceholder(person1RequiredGender)
  );
  populatePersonSelect(
    couplePerson2Sel,
    (person) => {
      if (person2RequiredGender && person.gender !== person2RequiredGender) return false;
      if (!person1) return true;
      return !p1Ancestors.has(person.id) &&
             !p1Descendants.has(person.id) &&
             !p1Siblings.has(person.id);
    },
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

function populateSiblingPersonSelects() {
  const sel1Current = siblingPerson1Sel.value;
  const sel2Current = siblingPerson2Sel.value;

  // Sibling 1: exclude the currently selected Sibling 2
  populatePersonSelect(
    siblingPerson1Sel,
    (person) => person.id !== siblingPerson2Sel.value
  );
  // Sibling 2: exclude the currently selected Sibling 1
  populatePersonSelect(
    siblingPerson2Sel,
    (person) => person.id !== siblingPerson1Sel.value
  );

  // Restore selections if still valid
  siblingPerson1Sel.value = data.persons.some((p) => p.id === sel1Current) ? sel1Current : '';
  siblingPerson2Sel.value = data.persons.some((p) => p.id === sel2Current) ? sel2Current : '';
}

function selectPerson(personId) {
  if (!getPerson(personId)) return;
  selectedPersonId = personId;
  selectedCoupleId = null;
  applyPersonToCoupleForm(personId);
  renderView();
}

function selectCouple(coupleId) {
  const couple = getCouple(coupleId);
  if (!couple) return;
  selectedCoupleId = coupleId;
  selectedPersonId = null;
  childCoupleSel.value = coupleId;
  renderView();
}

function clearSelection() {
  selectedPersonId = null;
  selectedCoupleId = null;
  renderView();
}

function escapeSelectorValue(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findDiagramNode(rawId) {
  const escapedId = escapeSelectorValue(rawId);
  return mermaidDiagram.querySelector(
    `g[data-id="${escapedId}"], g[id="${escapedId}"], g[id$="-${escapedId}"]`
  );
}

function enhanceDiagramInteractivity() {
  mermaidDiagram.querySelectorAll('g.node').forEach((node) => {
    node.classList.add('pft-node--interactive');
  });

  data.persons.forEach((person) => {
    const node = findDiagramNode(MermaidGen.nodeId(person.id));
    if (!node) return;
    node.dataset.personId = person.id;
    if (selectedPersonId === person.id) {
      node.classList.add('pft-node--active');
    } else if (selectedCoupleId) {
      const selectedCouple = getCouple(selectedCoupleId);
      if (selectedCouple && (person.id === selectedCouple.person1Id || person.id === selectedCouple.person2Id)) {
        node.classList.add('pft-node--active');
      }
    }
  });

  data.couples.forEach((couple) => {
    const node = findDiagramNode(MermaidGen.pairNodeId(couple.id));
    if (!node) return;
    node.dataset.coupleId = couple.id;
    if (selectedCoupleId === couple.id) {
      node.classList.add('pft-node--active');
    }
  });
}

/* ── Mermaid diagram ──────────────────────────────────────── */
async function renderDiagram() {
  const code = MermaidGen.generate(getDiagramData());
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
    enhanceDiagramInteractivity();
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

/** Returns true if id1 and id2 share at least one parent couple or an explicit sibling group. */
function areSiblings(id1, id2) {
  if (data.couples.some(
    (c) => (c.childIds || []).includes(id1) && (c.childIds || []).includes(id2)
  )) return true;
  return (data.siblingGroups || []).some(
    (g) => (g.personIds || []).includes(id1) && (g.personIds || []).includes(id2)
  );
}

/** Returns a Set of all sibling IDs (shared parent couple or explicit sibling group) of personId. */
function getSiblings(personId) {
  const siblings = new Set();
  data.couples.forEach((c) => {
    if ((c.childIds || []).includes(personId)) {
      (c.childIds || []).forEach((id) => { if (id !== personId) siblings.add(id); });
    }
  });
  (data.siblingGroups || []).forEach((g) => {
    if ((g.personIds || []).includes(personId)) {
      (g.personIds || []).forEach((id) => { if (id !== personId) siblings.add(id); });
    }
  });
  return siblings;
}

function coupleExists(person1Id, person2Id) {
  return data.couples.some(
    (c) => (c.person1Id === person1Id && c.person2Id === person2Id) ||
           (c.person1Id === person2Id && c.person2Id === person1Id)
  );
}

function canFormCouple(person1Id, person2Id) {
  if (!person1Id || !person2Id || person1Id === person2Id) return false;
  const person1 = getPerson(person1Id);
  const person2 = getPerson(person2Id);
  if (!person1 || !person2) return false;
  if (person1.gender === person2.gender) return false;
  if (coupleExists(person1Id, person2Id)) return false;
  if (getAncestors(person1Id).has(person2Id) || getAncestors(person2Id).has(person1Id)) return false;
  if (areSiblings(person1Id, person2Id)) return false;
  return true;
}

function canRegisterChild(coupleId, childId, registeredChildIds = getRegisteredChildIds()) {
  if (!coupleId || !childId) return false;
  const couple = getCouple(coupleId);
  if (!couple || !getPerson(childId)) return false;
  if (couple.person1Id === childId || couple.person2Id === childId) return false;
  if ((couple.childIds || []).includes(childId)) return false;
  return !registeredChildIds.has(childId);
}

function collectPerspectiveData(rootPersonIds, anchoredCoupleId = null) {
  const linealPersonIds = new Set();
  const relevantPersonIds = new Set();

  rootPersonIds.forEach((personId) => {
    if (!getPerson(personId)) return;
    linealPersonIds.add(personId);
    relevantPersonIds.add(personId);
    getAncestors(personId).forEach((id) => {
      linealPersonIds.add(id);
      relevantPersonIds.add(id);
    });
    getDescendants(personId).forEach((id) => {
      linealPersonIds.add(id);
      relevantPersonIds.add(id);
    });
    getSiblings(personId).forEach((id) => {
      relevantPersonIds.add(id);
    });
  });

  const relevantCouples = data.couples.filter((couple) => {
    if (anchoredCoupleId && couple.id === anchoredCoupleId) return true;
    return linealPersonIds.has(couple.person1Id) ||
           linealPersonIds.has(couple.person2Id) ||
           (couple.childIds || []).some((childId) => relevantPersonIds.has(childId));
  });

  relevantCouples.forEach((couple) => {
    relevantPersonIds.add(couple.person1Id);
    relevantPersonIds.add(couple.person2Id);
    (couple.childIds || []).forEach((childId) => relevantPersonIds.add(childId));
  });

  const persons = data.persons.filter((person) => relevantPersonIds.has(person.id));
  const couples = relevantCouples;
  const siblingGroups = (data.siblingGroups || [])
    .map((group) => {
      const filteredPersonIds = (group.personIds || []).filter((personId) => relevantPersonIds.has(personId));
      return { id: group.id, personIds: filteredPersonIds };
    })
    .filter((group) => group.personIds.length >= 2);

  return { persons, couples, siblingGroups };
}

function getDiagramData() {
  if (selectedPersonId) return collectPerspectiveData([selectedPersonId]);
  const selectedCouple = selectedCoupleId ? getCouple(selectedCoupleId) : null;
  if (selectedCouple) {
    return collectPerspectiveData(
      [selectedCouple.person1Id, selectedCouple.person2Id],
      selectedCouple.id
    );
  }
  return data;
}

function applyPersonToCoupleForm(personId) {
  const current1 = couplePerson1Sel.value;
  const current2 = couplePerson2Sel.value;

  if (!current1 && !current2) {
    couplePerson1Sel.value = personId;
    couplePerson2Sel.value = '';
  } else if (current1 && current1 !== personId && canFormCouple(current1, personId)) {
    couplePerson2Sel.value = personId;
  } else if (!current1 && current2 && current2 !== personId && canFormCouple(current2, personId)) {
    couplePerson1Sel.value = personId;
  } else {
    couplePerson1Sel.value = personId;
    couplePerson2Sel.value = '';
  }

  populateCouplePersonSelects();
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

  if (!canFormCouple(p1, p2)) {
    if (coupleExists(p1, p2)) {
      showToast('This couple already exists', 'error');
    } else if (getAncestors(p1).has(p2) || getAncestors(p2).has(p1)) {
      showToast('Cannot form a couple between (grand-)parents and (grand-)children', 'error');
    } else if (areSiblings(p1, p2)) {
      showToast('Cannot form a couple between siblings', 'error');
    } else {
      showToast('This couple is not allowed', 'error');
    }
    return;
  }

  const newCouple = { id: genId(), person1Id: p1, person2Id: p2, childIds: [] };
  data.couples.push(newCouple);
  createCoupleForm.reset();
  selectedPersonId = null;
  selectedCoupleId = newCouple.id;
  childCoupleSel.value = newCouple.id;
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

  if (!canRegisterChild(coupleId, childId)) {
    if (couple.person1Id === childId || couple.person2Id === childId) {
      showToast('A parent cannot be their own child', 'error');
    } else if (couple.childIds.includes(childId)) {
      showToast('This person is already a child of this couple', 'error');
    } else {
      showToast('This dweller is not available as a child', 'error');
    }
    return;
  }

  couple.childIds.push(childId);
  addChildForm.reset();
  selectedCoupleId = coupleId;
  selectedPersonId = null;
  childCoupleSel.value = coupleId;
  refresh();
  showToast(`${getPersonName(childId)} added as child`, 'success');
});

/* ── Event: Link siblings ─────────────────────────────────── */
siblingPerson1Sel.addEventListener('change', () => populateSiblingPersonSelects());
siblingPerson2Sel.addEventListener('change', () => populateSiblingPersonSelects());

linkSiblingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const sib1Id = siblingPerson1Sel.value;
  const sib2Id = siblingPerson2Sel.value;

  if (!sib1Id || !sib2Id) { showToast('Please select two people', 'error'); return; }
  if (sib1Id === sib2Id)  { showToast('A person cannot be their own sibling', 'error'); return; }

  if (areSiblings(sib1Id, sib2Id)) {
    showToast('These people are already siblings', 'error');
    return;
  }

  const groups    = data.siblingGroups || [];
  const group1Idx = groups.findIndex((g) => (g.personIds || []).includes(sib1Id));
  const group2Idx = groups.findIndex((g) => (g.personIds || []).includes(sib2Id));

  if (group1Idx === -1 && group2Idx === -1) {
    // Neither is in an explicit sibling group — create a new one
    groups.push({ id: genId(), personIds: [sib1Id, sib2Id] });
  } else if (group1Idx !== -1 && group2Idx === -1) {
    // sib2 joins sib1's existing group
    groups[group1Idx].personIds.push(sib2Id);
  } else if (group1Idx === -1 && group2Idx !== -1) {
    // sib1 joins sib2's existing group
    groups[group2Idx].personIds.push(sib1Id);
  } else if (group1Idx !== group2Idx) {
    // They are in different groups — merge them
    const merged = {
      id:        genId(),
      personIds: [...new Set([...groups[group1Idx].personIds, ...groups[group2Idx].personIds])]
    };
    const [higherIndex, lowerIndex] = [group1Idx, group2Idx].sort((a, b) => b - a);
    groups.splice(higherIndex, 1);
    groups.splice(lowerIndex, 1);
    groups.push(merged);
  }

  data.siblingGroups = groups;
  linkSiblingsForm.reset();
  refresh();
  showToast(`${getPersonName(sib1Id)} and ${getPersonName(sib2Id)} linked as siblings`, 'success');
});

/* ── Event: Delete person / couple / sibling group (delegated) */
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
    // Remove person from any explicit sibling groups; discard groups that become too small
    if (data.siblingGroups) {
      data.siblingGroups = data.siblingGroups
        .map((g) => ({ ...g, personIds: g.personIds.filter((id) => id !== delPersonId) }))
        .filter((g) => g.personIds.length >= 2);
    }
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
    return;
  }

  const delSiblingGroupId = e.target.dataset.deleteSiblingGroup;
  if (delSiblingGroupId) {
    if (!await showConfirm('Remove this sibling link?')) return;
    data.siblingGroups = (data.siblingGroups || []).filter((g) => g.id !== delSiblingGroupId);
    refresh();
    showToast('Sibling link removed');
    return;
  }

  const personChip = e.target.closest('.person-chip[data-person-id]');
  if (personChip) {
    selectPerson(personChip.dataset.personId);
    return;
  }

  const coupleChip = e.target.closest('.couple-chip[data-couple-id]');
  if (coupleChip) {
    selectCouple(coupleChip.dataset.coupleId);
    return;
  }

  const personNode = e.target.closest('[data-person-id]');
  if (personNode && mermaidDiagram.contains(personNode)) {
    selectPerson(personNode.dataset.personId);
    return;
  }

  const coupleNode = e.target.closest('[data-couple-id]');
  if (coupleNode && mermaidDiagram.contains(coupleNode)) {
    selectCouple(coupleNode.dataset.coupleId);
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

clearFocusBtn.addEventListener('click', () => {
  clearSelection();
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
  if (!await showConfirm('Delete ALL people, couples, and sibling links? This cannot be undone.')) return;
  data = { persons: [], couples: [], siblingGroups: [] };
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const interactiveTarget = e.target.closest('[role="button"]');
  if (!interactiveTarget) return;
  const personChip = interactiveTarget.closest('.person-chip[data-person-id]');
  if (personChip) {
    e.preventDefault();
    selectPerson(personChip.dataset.personId);
    return;
  }
  const coupleChip = interactiveTarget.closest('.couple-chip[data-couple-id]');
  if (coupleChip) {
    e.preventDefault();
    selectCouple(coupleChip.dataset.coupleId);
  }
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
    btn.type = 'button';
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
