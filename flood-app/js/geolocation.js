/**
 * geolocation.js — auto-detect via W3C Geolocation API, with a manual
 * county fallback when denied, unavailable, or slow (FR-1.1, FR-1.2).
 */

const FloodGeo = (() => {

  const TIMEOUT_MS = 15000; // ">15s" triggers fallback per FR-1.2

  /**
   * Resolve to { lat, lng, source: "gps"|"manual", label }.
   * Rejects with a reason string ("denied" | "timeout" | "unsupported" | "error")
   * so the caller can decide whether to show the manual fallback.
   */
  function detect() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject("unsupported");
        return;
      }
      const timer = setTimeout(() => reject("timeout"), TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            source: "gps",
            label: "Detected via device location",
          });
        },
        (err) => {
          clearTimeout(timer);
          reject(err.code === err.PERMISSION_DENIED ? "denied" : "error");
        },
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
      );
    });
  }

  async function loadCounties() {
    const res = await fetch("data/counties.json");
    if (!res.ok) throw new Error("Could not load county list");
    return res.json();
  }

  async function loadAdminUnits() {
    const res = await fetch("data/admin-units.json");
    if (!res.ok) throw new Error("Could not load administrative unit list");
    return res.json();
  }

  function populateCountySelect(selectEl, counties) {
    counties.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      opt.dataset.lat = c.lat;
      opt.dataset.lng = c.lng;
      selectEl.appendChild(opt);
    });
  }

  function resetSelect(selectEl, label) {
    selectEl.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = label;
    opt.selected = true;
    selectEl.appendChild(opt);
  }

  function populateAdminSelect(selectEl, values, label) {
    const hasValues = values && values.length;
    resetSelect(selectEl, hasValues ? label : "Not available - county fallback");
    (values || []).forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value.name;
      opt.textContent = value.name;
      opt.dataset.lat = value.lat;
      opt.dataset.lng = value.lng;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = !hasValues;
    selectEl.setAttribute("aria-disabled", String(!hasValues));
  }

  function findCounty(adminUnits, name) {
    return (adminUnits && adminUnits.counties || []).find((county) => county.name === name) || null;
  }

  function manualSelection(countySelect, constituencySelect, wardSelect) {
    const countyOpt = countySelect.selectedOptions[0];
    const selected = wardSelect && !wardSelect.disabled && wardSelect.value
      ? wardSelect.selectedOptions[0]
      : constituencySelect && !constituencySelect.disabled && constituencySelect.value
        ? constituencySelect.selectedOptions[0]
        : countyOpt;
    if (!selected || !selected.value) return null;
    return {
      lat: parseFloat(selected.dataset.lat),
      lng: parseFloat(selected.dataset.lng),
      county: countyOpt.value,
      constituency: constituencySelect && constituencySelect.value || null,
      ward: wardSelect && wardSelect.value || null,
      source: "manual",
      label: [countyOpt.value, constituencySelect && constituencySelect.value, wardSelect && wardSelect.value].filter(Boolean).join(" / ") + " (manual)",
    };
  }

  return { detect, loadCounties, loadAdminUnits, populateCountySelect, populateAdminSelect, findCounty, manualSelection };
})();
