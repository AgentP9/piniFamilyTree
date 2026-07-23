/**
 * searchable-select.js — lightweight combobox wrapper for <select> elements.
 *
 * Wraps a native <select> with a text input + filtered dropdown list so users
 * can type to narrow down the options. The native <select> remains in the DOM
 * (hidden) and continues to hold the selected value, so all existing code that
 * reads `.value` or listens for `change` events works without modification.
 *
 * Usage:
 *   const ss = new SearchableSelect(document.getElementById('my-select'));
 *
 * The wrapper observes the native <select> for option mutations (triggered when
 * populatePersonSelect / populateCoupleSelect rebuild the list) and refreshes
 * the dropdown list automatically, using a zero-delay debounce so the sync
 * runs after any programmatic `.value` assignment that follows the mutation.
 */

/**
 * Delay (ms) between an input blur and closing the dropdown.
 * Must be long enough for a mousedown on a list item to register first,
 * but short enough to feel responsive (~150 ms covers most browsers).
 */
const _SS_BLUR_DELAY_MS = 150;

/** All live SearchableSelect instances — used by the single shared click handler. */
const _ssInstances = [];

/** One document-level click listener is registered for all instances combined. */
let _ssDocClickReady = false;

function _initSharedDocClickHandler() {
  if (_ssDocClickReady) return;
  _ssDocClickReady = true;
  document.addEventListener('click', (e) => {
    _ssInstances.forEach((ss) => {
      if (ss._open && !ss._wrapper.contains(e.target)) {
        ss._closeList();
        ss._syncDisplay();
      }
    });
  });
}

class SearchableSelect {
  constructor(nativeSelect) {
    this._sel   = nativeSelect;
    this._open  = false;
    this._activeIdx = -1;
    this._syncTimer = null;

    _ssInstances.push(this);
    _initSharedDocClickHandler();

    this._build();
    this._observe();
    this._addFormResetListener();
  }

  /* ── DOM construction ───────────────────────────────────── */
  _build() {
    const wrapper  = document.createElement('div');
    wrapper.className = 'ss-wrapper';

    const input = document.createElement('input');
    input.type         = 'text';
    input.className    = 'ss-input';
    input.autocomplete = 'off';
    input.spellcheck   = false;
    input.setAttribute('role',           'combobox');
    input.setAttribute('aria-expanded',  'false');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');

    const listbox = document.createElement('div');
    listbox.className = 'ss-listbox';
    listbox.setAttribute('role', 'listbox');
    listbox.hidden = true;

    wrapper.appendChild(input);
    wrapper.appendChild(listbox);

    // Insert wrapper in place of the select, then move the select inside it
    this._sel.parentNode.insertBefore(wrapper, this._sel);
    wrapper.appendChild(this._sel);
    this._sel.style.display = 'none';
    this._sel.setAttribute('tabindex', '-1');

    this._wrapper = wrapper;
    this._input   = input;
    this._listbox = listbox;

    this._syncDisplay();
    this._bindEvents();
  }

  /* ── Build / rebuild the filtered option list ───────────── */
  _buildList() {
    this._listbox.innerHTML = '';
    this._activeIdx = -1;

    const query   = this._input.value.trim().toLowerCase();
    const options = Array.from(this._sel.options);

    let visibleCount = 0;
    options.forEach((opt) => {
      const text = opt.textContent.trim();
      // Always show the placeholder option so the user can clear their choice;
      // for real options, only show when they match the query (if any).
      const isPlaceholder = opt.value === '';
      if (!isPlaceholder && query && !text.toLowerCase().includes(query)) return;

      const item = document.createElement('div');
      item.className   = 'ss-option';
      item.dataset.value = opt.value;
      item.textContent = text;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(opt.value === this._sel.value));
      if (isPlaceholder) item.classList.add('ss-option--placeholder');
      if (opt.value === this._sel.value) item.classList.add('ss-option--selected');

      item.addEventListener('mousedown', (e) => {
        // Prevent the input from losing focus before we register the selection
        e.preventDefault();
        this._pick(opt.value, text, isPlaceholder);
      });

      this._listbox.appendChild(item);
      visibleCount += 1;
    });

    if (visibleCount === 0) {
      const empty = document.createElement('div');
      empty.className   = 'ss-option ss-option--empty';
      empty.textContent = 'No matches';
      this._listbox.appendChild(empty);
    }
  }

  /* ── Select a value from the list ──────────────────────── */
  _pick(value, displayText, isPlaceholder) {
    this._sel.value = value;
    this._input.value = isPlaceholder ? '' : displayText;
    this._closeList();
    // Notify all existing change-event listeners on the native select
    this._sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ── Keep the text input in sync with the native value ──── */
  _syncDisplay() {
    const val = this._sel.value;
    if (!val) {
      this._input.value = '';
      this._input.placeholder = this._placeholder();
    } else {
      const opt = Array.from(this._sel.options).find((o) => o.value === val);
      this._input.value = opt ? opt.textContent.trim() : '';
      this._input.placeholder = this._placeholder();
    }
  }

  _placeholder() {
    const first = this._sel.options[0];
    return (first && first.value === '') ? first.textContent.trim() : '— Select —';
  }

  /* ── Open / close helpers ───────────────────────────────── */
  _openList() {
    this._buildList();
    this._listbox.hidden = false;
    this._input.setAttribute('aria-expanded', 'true');
    this._wrapper.classList.add('ss-wrapper--open');
    this._open = true;
  }

  _closeList() {
    this._listbox.hidden = true;
    this._input.setAttribute('aria-expanded', 'false');
    this._wrapper.classList.remove('ss-wrapper--open');
    this._open = false;
    this._activeIdx = -1;
    this._clearActive();
  }

  _clearActive() {
    this._listbox.querySelectorAll('.ss-option--active').forEach((el) => {
      el.classList.remove('ss-option--active');
    });
  }

  /* ── Keyboard navigation ───────────────────────────────── */
  _getItems() {
    return Array.from(this._listbox.querySelectorAll(
      '.ss-option:not(.ss-option--empty):not(.ss-option--placeholder)'
    ));
  }

  _moveActive(delta) {
    const items = this._getItems();
    if (items.length === 0) return;
    this._clearActive();
    this._activeIdx = Math.max(0, Math.min(items.length - 1, this._activeIdx + delta));
    const active = items[this._activeIdx];
    active.classList.add('ss-option--active');
    active.scrollIntoView({ block: 'nearest' });
  }

  /* ── Input event binding ────────────────────────────────── */
  _bindEvents() {
    this._input.addEventListener('focus', () => {
      // Select all text so user can immediately start filtering
      this._input.select();
      this._openList();
    });

    this._input.addEventListener('input', () => {
      this._openList();
    });

    this._input.addEventListener('blur', () => {
      // _SS_BLUR_DELAY_MS: allows the mousedown on a list item to fire and
      // complete before the blur handler closes the list and resets the input.
      setTimeout(() => {
        if (this._open) {
          this._closeList();
          this._syncDisplay();
        }
      }, _SS_BLUR_DELAY_MS);
    });

    this._input.addEventListener('keydown', (e) => {
      if (!this._open && e.key !== 'Tab') {
        this._openList();
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this._moveActive(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._moveActive(-1);
          break;
        case 'Enter': {
          e.preventDefault();
          const items = this._getItems();
          if (this._activeIdx >= 0 && items[this._activeIdx]) {
            const item = items[this._activeIdx];
            this._pick(item.dataset.value, item.textContent, item.dataset.value === '');
          } else {
            // Confirm the first visible item if nothing is active
            const first = items[0];
            if (first) this._pick(first.dataset.value, first.textContent, first.dataset.value === '');
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          this._closeList();
          this._syncDisplay();
          this._input.blur();
          break;
        default:
          break;
      }
    });
  }

  /* ── MutationObserver: react to option list rebuilds ───── */
  _observe() {
    this._observer = new MutationObserver(() => {
      // Debounce: let the caller finish setting sel.value after mutating options
      clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(() => {
        if (this._open) {
          this._buildList(); // refresh visible list with new options
        }
        this._syncDisplay();
      }, 0);
    });

    this._observer.observe(this._sel, { childList: true, subtree: true });
  }

  /* ── Form reset support ─────────────────────────────────── */
  _addFormResetListener() {
    const form = this._sel.closest('form');
    if (!form) return;
    form.addEventListener('reset', () => {
      // The native select resets synchronously; sync our display after
      setTimeout(() => {
        this._syncDisplay();
      }, 0);
    });
  }
}
