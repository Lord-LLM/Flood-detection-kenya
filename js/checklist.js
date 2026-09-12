/**
 * checklist.js — renders the 23-item preparedness checklist and persists
 * completion state in localStorage, keyed per item AND location (FR-3.3).
 */

const FloodChecklist = (() => {

  const STORAGE_PREFIX = "flood-checklist:";
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, per FR-3.3

  function storageKey(locationKey) {
    return `${STORAGE_PREFIX}${locationKey}`;
  }

  /**
   * Load saved state for a location. Applies the 30-day staleness rule:
   * state older than 30 days is discarded and the caller is told so it
   * can show the "reset with notice" the acceptance criteria call for.
   */
  function loadState(locationKey) {
    const raw = localStorage.getItem(storageKey(locationKey));
    if (!raw) return { items: {}, wasReset: false };
    try {
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.savedAt || 0);
      if (age > MAX_AGE_MS) {
        localStorage.removeItem(storageKey(locationKey));
        return { items: {}, wasReset: true };
      }
      return { items: parsed.items || {}, wasReset: false };
    } catch (e) {
      return { items: {}, wasReset: false };
    }
  }

  function saveState(locationKey, items) {
    const payload = JSON.stringify({ savedAt: Date.now(), items });
    try {
      localStorage.setItem(storageKey(locationKey), payload);
    } catch (e) {
      // localStorage unavailable/full — fail silently, in-memory state
      // for this session still works (graceful degradation, FR-4.1 spirit).
      console.warn("Could not persist checklist state:", e);
    }
  }

  function itemRow(item, done, onToggle) {
    const li = document.createElement("li");
    li.className = "checklist__item";
    li.dataset.done = String(done);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "checklist__checkbox";
    checkbox.id = `chk-${item.id}`;
    checkbox.checked = done;
    checkbox.setAttribute("aria-describedby", `chk-label-${item.id}`);

    const label = document.createElement("label");
    label.className = "checklist__label";
    label.id = `chk-label-${item.id}`;
    label.htmlFor = checkbox.id;
    label.textContent = item.text;

    checkbox.addEventListener("change", () => {
      li.dataset.done = String(checkbox.checked);
      onToggle(item.id, checkbox.checked);
    });

    li.appendChild(checkbox);
    li.appendChild(label);
    return li;
  }

  /**
   * Render all three phase lists and wire up persistence + live progress.
   * items: [{id, phase: "Before"|"During"|"After", text}], exactly 23 (FR-3.1).
   */
  function render({ items, locationKey, listEls, progressEl }) {
    const { items: saved, wasReset } = loadState(locationKey);
    const state = { ...saved };

    function persist() {
      saveState(locationKey, state);
      updateProgress();
    }

    function updateProgress() {
      const total = items.length;
      const done = items.filter((i) => !!state[i.id]).length;
      progressEl.textContent = `${done} of ${total} done`;
    }

    Object.values(listEls).forEach((el) => (el.innerHTML = ""));

    items.forEach((item) => {
      const targetEl =
        item.phase === "Before" ? listEls.before :
        item.phase === "During" ? listEls.during :
        listEls.after;
      const done = !!state[item.id];
      const row = itemRow(item, done, (id, checked) => {
        state[id] = checked;
        persist();
      });
      targetEl.appendChild(row);
    });

    updateProgress();
    return { wasReset };
  }

  /**
   * Build the print-only summary DOM (checklist + risk summary, FR-3.4).
   * Kept to <=2 A4 pages via compact CSS in the print media query.
   */
  function renderPrintSummary({ items, riskSummary, container }) {
    container.innerHTML = "";

    const heading = document.createElement("h1");
    heading.textContent = "Flood Watch Kenya — Preparedness Summary";
    container.appendChild(heading);

    if (riskSummary) {
      const p = document.createElement("p");
      p.innerHTML = `<strong>Risk tier:</strong> ${riskSummary.tierLabel} &mdash; ${riskSummary.reason}`;
      container.appendChild(p);
    }

    ["Before", "During", "After"].forEach((phase) => {
      const h2 = document.createElement("h2");
      h2.textContent = phase;
      container.appendChild(h2);
      const ul = document.createElement("ul");
      items.filter((i) => i.phase === phase).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item.text;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    });
  }

  return { render, renderPrintSummary, loadState, saveState };
})();
