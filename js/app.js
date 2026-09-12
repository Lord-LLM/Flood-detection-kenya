/**
 * app.js — orchestrates the workflow tracker, location resolution,
 * flood-zone + forecast lookups, risk classification, checklist, and
 * offline/error handling. This is the only file that touches the DOM
 * at the top level; risk.js / pip.js / checklist.js stay pure/isolated
 * so they're unit-testable per the SRS test-case IDs.
 */

(() => {
  "use strict";

  const REFRESH_MS = 30 * 60 * 1000; // FR-2.2: refresh forecast every 30 min
  const REMINDER_MS = 3 * 60 * 60 * 1000;
  const CACHE_KEY = "flood-last-result";
  const THEME_KEY = "flood-theme";

  // ---- DOM refs -----------------------------------------------------
  const els = {
    trackerSection: document.getElementById("tracker"),
    useLocationBtn: document.getElementById("use-location-btn"),
    trackerList: document.getElementById("tracker-list"),
    manualPanel: document.getElementById("manual-location"),
    manualHint: document.getElementById("manual-location-hint"),
    manualForm: document.getElementById("manual-location-form"),
    countySelect: document.getElementById("county-select"),
    constituencySelect: document.getElementById("constituency-select"),
    wardSelect: document.getElementById("ward-select"),
    resultSection: document.getElementById("result"),
    resultCard: document.getElementById("result-card"),
    resultSkeleton: document.getElementById("result-skeleton"),
    resultTierLabel: document.getElementById("result-tier-label"),
    resultTierDescription: document.getElementById("result-tier-description"),
    resultReason: document.getElementById("result-reason"),
    resultContext: document.getElementById("result-context"),
    resultStale: document.getElementById("result-stale"),
    resultChecked: document.getElementById("result-checked"),
    recommendationsList: document.getElementById("recommendations-list"),
    detailsToggle: document.getElementById("result-details-toggle"),
    details: document.getElementById("result-details"),
    detailRainfall: document.getElementById("detail-rainfall"),
    detailWindow: document.getElementById("detail-window"),
    detailZone: document.getElementById("detail-zone"),
    detailElevation: document.getElementById("detail-elevation"),
    detailTerrain: document.getElementById("detail-terrain"),
    detailWater: document.getElementById("detail-water"),
    detailLocation: document.getElementById("detail-location"),
    detailSource: document.getElementById("detail-source"),
    terrainPanel: document.getElementById("terrain-panel"),
    terrainMap: document.getElementById("terrain-map"),
    terrainSummary: document.getElementById("terrain-summary"),
    changeLocationBtn: document.getElementById("change-location-btn"),
    errorPanel: document.getElementById("error-panel"),
    errorMessage: document.getElementById("error-message"),
    retryBtn: document.getElementById("retry-btn"),
    checklistSection: document.getElementById("checklist-section"),
    checklistProgress: document.getElementById("checklist-progress"),
    tabs: {
      before: document.getElementById("tab-before"),
      during: document.getElementById("tab-during"),
      after: document.getElementById("tab-after"),
    },
    panels: {
      before: document.getElementById("panel-before"),
      during: document.getElementById("panel-during"),
      after: document.getElementById("panel-after"),
    },
    lists: {
      before: document.getElementById("list-before"),
      during: document.getElementById("list-during"),
      after: document.getElementById("list-after"),
    },
    printBtn: document.getElementById("print-btn"),
    printSummary: document.getElementById("print-summary"),
    offlineBadge: document.getElementById("offline-badge"),
    configVersion: document.getElementById("config-version"),
    themeToggle: document.getElementById("theme-toggle"),
    themeColor: document.getElementById("theme-color"),
    resultLocation: document.getElementById("result-location"),
    resultPrecision: document.getElementById("result-location-precision"),
    addressSearch: document.getElementById("address-search"),
    addressSuggestions: document.getElementById("address-suggestions"),
    seasonalOutlook: document.getElementById("seasonal-outlook"),
    outlookSummary: document.getElementById("outlook-summary"),
    officialSources: document.getElementById("official-sources"),
    officialSourcesList: document.getElementById("official-sources-list"),
  };

  let config = null;
  let floodZones = null;
  let refreshTimer = null;

  function mapboxToken() {
    const value = window.FLOOD_CONFIG_KEYS && window.FLOOD_CONFIG_KEYS.MAPBOX_ACCESS_TOKEN;
    return value && !value.startsWith("PASTE_") ? value : null;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    els.themeToggle.setAttribute("aria-pressed", String(dark));
    els.themeToggle.textContent = dark ? "Light mode" : "Dark mode";
    els.themeColor.setAttribute("content", dark ? "#0E1013" : "#FAFBFC");
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* unavailable */ }
    const preferred = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(preferred);
  }

  els.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* unavailable */ }
  });

  // ---- Tracker (UI directive 1.1) -----------------------------------
  function setStep(stepName, state) {
    const li = els.trackerList.querySelector(`[data-step="${stepName}"]`);
    if (li) li.dataset.state = state;
  }

  function resetTracker() {
    ["location", "zone", "terrain", "forecast", "risk"].forEach((s) => setStep(s, ""));
  }

  // ---- Error panel ----------------------------------------------------
  function showError(message, onRetry) {
    els.errorPanel.hidden = false;
    els.errorMessage.textContent = message;
    els.retryBtn.onclick = () => {
      els.errorPanel.hidden = true;
      onRetry();
    };
  }
  function hideError() {
    els.errorPanel.hidden = true;
  }

  // ---- Manual location -------------------------------------------------
  async function showManualLocation(hintText) {
    els.manualHint.textContent = hintText;
    if (!els.countySelect.dataset.populated) {
      const counties = await FloodGeo.loadCounties();
      FloodGeo.populateCountySelect(els.countySelect, counties);
      els.countySelect.dataset.populated = "true";
      try {
        els.adminUnits = await FloodGeo.loadAdminUnits();
      } catch (e) {
        els.adminUnits = null;
      }
    }
    els.manualPanel.hidden = false;
  }
  function hideManualLocation() {
    els.manualPanel.hidden = true;
  }

  function hideAddressSuggestions() {
    els.addressSuggestions.hidden = true;
    els.addressSuggestions.innerHTML = "";
  }

  let addressSessionToken = null;
  let addressSearchTimer = null;
  let selectedSuggestion = -1;

  function renderAddressSuggestions(predictions) {
    els.addressSuggestions.innerHTML = "";
    selectedSuggestion = -1;
    (predictions || []).slice(0, 5).forEach((prediction, index) => {
      const item = document.createElement("li");
      item.className = "address-suggestions__item";
      item.textContent = prediction.description;
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.dataset.index = String(index);
      item.addEventListener("click", () => chooseAddress(prediction));
      els.addressSuggestions.appendChild(item);
    });
    els.addressSuggestions.hidden = !els.addressSuggestions.children.length;
  }

  async function chooseAddress(prediction) {
    hideAddressSuggestions();
    const details = await FloodGeocoding.getPlaceDetails(prediction.place_id, addressSessionToken);
    if (!details) return;
    const location = {
      lat: details.lat,
      lng: details.lng,
      source: "address",
      label: details.formattedAddress,
      address: details.formattedAddress,
      addressLevel: details.addressLevel,
    };
    els.addressSearch.value = details.formattedAddress;
    hideManualLocation();
    runPipeline(location);
  }

  els.addressSearch.addEventListener("input", () => {
    clearTimeout(addressSearchTimer);
    const value = els.addressSearch.value.trim();
    if (!value) {
      hideAddressSuggestions();
      return;
    }
    addressSessionToken = addressSessionToken || FloodGeocoding.createSessionToken();
    // Debouncing avoids making one paid API request for every keystroke.
    addressSearchTimer = setTimeout(async () => {
      try {
        renderAddressSuggestions(await FloodGeocoding.autocomplete(value, addressSessionToken));
      } catch (e) {
        hideAddressSuggestions();
      }
    }, 300);
  });

  els.addressSearch.addEventListener("keydown", (event) => {
    const items = Array.from(els.addressSuggestions.querySelectorAll("li"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      selectedSuggestion = (selectedSuggestion + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      items.forEach((item, index) => item.setAttribute("aria-selected", String(index === selectedSuggestion)));
    } else if (event.key === "Enter" && selectedSuggestion >= 0 && items[selectedSuggestion]) {
      event.preventDefault();
      items[selectedSuggestion].click();
    } else if (event.key === "Escape") {
      hideAddressSuggestions();
    }
  });

  els.manualForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const loc = FloodGeo.manualSelection(els.countySelect, els.constituencySelect, els.wardSelect);
    if (!loc) return;
    hideManualLocation();
    runPipeline(loc);
  });

  els.countySelect.addEventListener("change", () => {
    const county = FloodGeo.findCounty(els.adminUnits, els.countySelect.value);
    FloodGeo.populateAdminSelect(els.constituencySelect, county && county.constituencies, "Select a constituency");
    FloodGeo.populateAdminSelect(els.wardSelect, null, "Select a ward");
  });

  els.constituencySelect.addEventListener("change", () => {
    const county = FloodGeo.findCounty(els.adminUnits, els.countySelect.value);
    const constituency = county && (county.constituencies || []).find((item) => item.name === els.constituencySelect.value);
    FloodGeo.populateAdminSelect(els.wardSelect, constituency && constituency.wards, "Select a ward");
  });

  els.changeLocationBtn.addEventListener("click", () => {
    els.resultSection.hidden = false;
    els.checklistSection.hidden = true;
    hideError();
    resetTracker();
    showManualLocation("Choose a different county.");
  });

  // ---- Result rendering (UI directive 1.2 — explainable results) -------
  function renderResult({ tier, reason, context, rainfallMm, windowLabel, inFloodZone, location, stale, fetchedAt, terrainAnalysis, terrainAdjustment, waterAdjustment, waterMatch, recommendations }) {
    els.resultSkeleton.hidden = true;
    els.resultCard.classList.remove("result__card--loading");
    els.resultCard.dataset.tier = tier;
    els.resultTierLabel.textContent = FloodRisk.TIER_LABELS[tier];
    els.resultTierDescription.textContent = FloodRisk.TIER_DESCRIPTIONS[tier];
    els.resultReason.textContent = reason;
    els.resultLocation.textContent = location.address
      ? `Location: ${location.address}`
      : `Location: ${location.label} (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;
    els.resultPrecision.textContent = location.addressLevel
      ? ({ building: "Building-level location", street: "Street-level location", area: "Area-level location - for an exact building, try searching your address above." }[location.addressLevel] || "")
      : "";
    els.resultPrecision.hidden = !els.resultPrecision.textContent;
    els.resultContext.textContent = context || "";
    els.resultContext.hidden = !context;

    if (stale) {
      els.resultStale.hidden = false;
      els.resultStale.textContent = `Showing cached forecast from ${stale}. Reconnect to update.`;
    } else {
      els.resultStale.hidden = true;
    }
    const checkedAt = fetchedAt || Date.now();
    const checkedAge = Date.now() - checkedAt;
    els.resultChecked.textContent = checkedAge >= REMINDER_MS
      ? `Last checked ${relativeTime(checkedAt)}. Please check again before relying on this result.`
      : `Last checked ${relativeTime(checkedAt)}.`;

    els.recommendationsList.innerHTML = "";
    recommendations.forEach((recommendation) => {
      const li = document.createElement("li");
      li.textContent = recommendation;
      els.recommendationsList.appendChild(li);
    });

    els.detailRainfall.textContent = `${rainfallMm.toFixed(1)} mm`;
    els.detailWindow.textContent = windowLabel;
    els.detailZone.textContent = inFloodZone ? "Inside a mapped flood zone" : "Outside mapped flood zones";
    if (els.detailElevation) {
      els.detailElevation.textContent = terrainAnalysis
        ? `${terrainAnalysis.centerElev.toFixed(0)} m (${terrainAnalysis.reliefM >= 0 ? "+" : ""}${terrainAnalysis.reliefM.toFixed(1)} m vs. surroundings)`
        : "Unavailable";
    }
    if (els.detailTerrain) {
      els.detailTerrain.textContent = terrainAdjustment
        ? `${terrainAdjustment.label} (${terrainAdjustment.modifier > 0 ? "+1 tier" : terrainAdjustment.modifier < 0 ? "-1 tier" : "no change"})`
        : "Unavailable";
    }
    if (els.detailWater) {
      els.detailWater.textContent = waterMatch
        ? `${Math.round(waterMatch.distanceM)} m to nearest mapped ${waterMatch.kind || "water feature"}`
        : (waterAdjustment && waterAdjustment.label === "unavailable" ? "Unavailable" : "None found nearby");
    }
    els.detailLocation.textContent = location.label;
    els.detailSource.textContent = "Open-Meteo API";

    els.resultSection.hidden = false;
  }

  els.detailsToggle.addEventListener("click", () => {
    const expanded = els.detailsToggle.getAttribute("aria-expanded") === "true";
    els.detailsToggle.setAttribute("aria-expanded", String(!expanded));
    els.details.hidden = expanded;
    els.detailsToggle.textContent = expanded ? "Show details" : "Hide details";
  });

  // ---- Checklist tabs ----------------------------------------------------
  function selectTab(phase) {
    Object.entries(els.tabs).forEach(([key, tabEl]) => {
      const selected = key === phase;
      tabEl.setAttribute("aria-selected", String(selected));
      tabEl.tabIndex = selected ? 0 : -1;
      els.panels[key].hidden = !selected;
    });
  }
  Object.entries(els.tabs).forEach(([key, tabEl]) => {
    tabEl.addEventListener("click", () => selectTab(key));
  });

  // ---- Offline badge -------------------------------------------------
  function updateOfflineBadge() {
    els.offlineBadge.hidden = navigator.onLine;
  }
  window.addEventListener("online", updateOfflineBadge);
  window.addEventListener("offline", updateOfflineBadge);

  // ---- Data loading -----------------------------------------------------
  async function loadConfig() {
    const res = await fetch("config/config.json");
    if (!res.ok) throw new Error("Could not load config");
    return res.json();
  }
  async function loadFloodZones() {
    const res = await fetch("data/flood-zones.geojson");
    if (!res.ok) throw new Error("Could not load flood zone data");
    return res.json();
  }

  /**
   * Open-Meteo forecast fetch (FR-2.2). No API key required.
   * Sums hourly precipitation over the next 24h.
   */
  async function fetchForecast(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&forecast_hours=24&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Forecast request failed");
    const data = await res.json();
    const values = (data.hourly && data.hourly.precipitation) || [];
    if (!values.length || values.some((value) => typeof value !== "number")) {
      throw new Error("Forecast response did not contain usable precipitation data");
    }
    const next24 = values.slice(0, 24);
    const totalMm = next24.reduce((sum, v) => sum + (v || 0), 0);
    return { totalMm, fetchedAt: Date.now() };
  }

  async function fetchSeasonalOutlook(lat, lng) {
    const url = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&forecast_days=46&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Seasonal outlook request failed");
    const data = await res.json();
    const values = (data.daily && data.daily.precipitation_sum) || [];
    if (!values.length || values.some((value) => typeof value !== "number")) {
      throw new Error("Seasonal outlook response did not contain usable precipitation data");
    }
    return { totalMm: values.reduce((sum, value) => sum + value, 0), days: values.length };
  }

  /**
   * Elevation-grid fetch for terrain.js's analysis (finer-than-county
   * risk signal). Open-Meteo's elevation endpoint takes batched
   * comma-separated lat/lng lists and returns one elevation (metres) per
   * point, in the same order — one request for the whole sample grid.
   */
  async function fetchElevationGrid(points) {
    const lats = points.map((p) => p.lat.toFixed(6)).join(",");
    const lngs = points.map((p) => p.lng.toFixed(6)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Elevation request failed");
    const data = await res.json();
    const elevations = data.elevation;
    if (!Array.isArray(elevations) || elevations.length !== points.length) {
      throw new Error("Elevation response did not match the sample grid");
    }
    return elevations;
  }

  /**
   * Nearby mapped water features (rivers, streams, water bodies,
   * springs) from OpenStreetMap via the public Overpass API — feeds
   * waterway.js's proximity check. Best-effort: a slow or unavailable
   * Overpass mirror should never block the core risk result, so callers
   * treat a rejected promise the same as "no data".
   */
  async function fetchNearbyWaterways(lat, lng, radiusM) {
    const query = `[out:json][timeout:8];(way["waterway"](around:${radiusM},${lat},${lng});way["natural"="water"](around:${radiusM},${lat},${lng});node["natural"="spring"](around:${radiusM},${lat},${lng}););out center 20;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Waterway lookup failed");
    const data = await res.json();
    const elements = (data && data.elements) || [];
    return elements
      .map((el) => {
        const elLat = typeof el.lat === "number" ? el.lat : el.center && el.center.lat;
        const elLng = typeof el.lon === "number" ? el.lon : el.center && el.center.lon;
        if (typeof elLat !== "number" || typeof elLng !== "number") return null;
        const tags = el.tags || {};
        return { lat: elLat, lng: elLng, name: tags.name || null, kind: tags.waterway || tags.natural || "water" };
      })
      .filter(Boolean);
  }

  /**
   * Small dependency-free SVG "terrain snapshot": the 8 sampled ring
   * points plotted around the centre, bar height showing elevation
   * relative to the centre (up = higher/drains-away, down = lower/pools),
   * plus a marker toward the nearest mapped water feature if one was
   * found. This is the "assess terrain via a map" step, done with plain
   * SVG so it stays within the no-framework, no-tile-server budget
   * (NFR-1/NFR-6) instead of pulling in a full map library.
   */
  function renderTerrainSvg({ analysis, radiusM, location, waterMatch, waterAdjustment }) {
    const size = 200, cx = size / 2, cy = size / 2, baseR = 26, maxSpan = 60;
    if (!analysis) {
      return '<p class="terrain-panel__empty">Terrain map unavailable for this location — showing rainfall and flood-zone signal only.</p>';
    }
    const { ringElevs, centerElev } = analysis;
    const diffs = ringElevs.map((v) => v - centerElev);
    const maxAbs = Math.max(1, ...diffs.map((d) => Math.abs(d)));
    const count = ringElevs.length;

    // Each ring point plotted at a distance from centre proportional to
    // how much higher or lower it is: higher points push OUT (that's
    // where runoff would drain toward), lower points pull IN toward the
    // dashed reference circle (that's the direction water collects from).
    const bars = ringElevs.map((elev, i) => {
      const diff = diffs[i];
      const angle = (2 * Math.PI * i) / count; // 0 = north, clockwise
      const norm = diff / maxAbs; // -1..1
      const rEnd = norm >= 0
        ? baseR + norm * maxSpan
        : Math.max(6, baseR + norm * (maxSpan * 0.6));
      const x = cx + rEnd * Math.sin(angle);
      const y = cy - rEnd * Math.cos(angle);
      const color = diff < -0.3 ? "var(--tier-orange)" : diff > 0.3 ? "var(--teal)" : "var(--line-strong)";
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round" />
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}" />`;
    }).join("");

    let waterMarker = "";
    if (waterMatch && waterAdjustment && waterAdjustment.modifier > 0 && location) {
      const dLat = waterMatch.lat - location.lat;
      const dLng = waterMatch.lng - location.lng;
      const bearing = Math.atan2(dLng, dLat); // 0 = north, clockwise, screen-space
      const wr = baseR + maxSpan + 14;
      const wx = cx + wr * Math.sin(bearing);
      const wy = cy - wr * Math.cos(bearing);
      waterMarker = `<circle cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" r="6" fill="var(--channel)" />
        <text x="${wx.toFixed(1)}" y="${(wy - 10).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--channel)">water</text>`;
    }

    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Relative elevation of the ground within about ${Math.round(radiusM || 200)}m of your location, plus a nearby mapped water feature if one was found.">
      <circle cx="${cx}" cy="${cy}" r="${baseR}" fill="none" stroke="var(--line)" stroke-dasharray="2 3" />
      ${bars}
      <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink)" />
      ${waterMarker}
    </svg>`;
  }

  function renderTerrainPanel({ analysis, radiusM, location, terrainAdjustment, waterAdjustment, waterMatch }) {
    if (!els.terrainPanel) return;
    const label = FloodTerrain.TERRAIN_LABELS[terrainAdjustment.label] || FloodTerrain.TERRAIN_LABELS.unavailable;
    let summary = `The ground around this point ${label}.`;
    if (waterAdjustment && waterAdjustment.modifier > 0 && waterMatch) {
      summary += ` A mapped ${waterMatch.kind || "water feature"} is about ${Math.round(waterMatch.distanceM)}m away.`;
    } else if (waterAdjustment && waterAdjustment.label === "mapped-but-far" && waterMatch) {
      summary += ` The nearest mapped water feature is about ${Math.round(waterMatch.distanceM)}m away — outside the near-water radius.`;
    }
    els.terrainSummary.textContent = summary;
    els.terrainMap.innerHTML = renderTerrainSvg({ analysis, radiusM, location, waterMatch, waterAdjustment });
    els.terrainPanel.hidden = false;
    if (mapboxToken()) FloodMap.render(location);
  }

  function renderOfficialSources() {
    const sources = config.officialSources || [];
    els.officialSourcesList.innerHTML = "";
    sources.forEach((source) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.name;
      li.appendChild(link);
      els.officialSourcesList.appendChild(li);
    });
    els.officialSources.hidden = !sources.length;
    // A future KMD/NDMA API or RSS feed can be wired into this config-driven section.
  }

  function renderSeasonalOutlook(outlook) {
    if (!outlook) {
      els.seasonalOutlook.hidden = true;
      return;
    }
    els.outlookSummary.textContent = `The seasonal model estimates ${outlook.totalMm.toFixed(0)} mm of precipitation across the next ${outlook.days} days. Use this for preparedness planning; use the immediate risk tier above for current action.`;
    els.seasonalOutlook.hidden = false;
  }

  function cacheResult(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (e) { /* storage full/unavailable — non-fatal */ }
  }
  function readCachedResult() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function relativeTime(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
  }

  // ---- Checklist bootstrap -------------------------------------------
  function locationKeyFor(loc) {
    return `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`;
  }

  function bootstrapChecklist(loc, riskSummary) {
    const checklistItems = config.checklist;
    const { wasReset } = FloodChecklist.render({
      items: checklistItems,
      locationKey: locationKeyFor(loc),
      listEls: els.lists,
      progressEl: els.checklistProgress,
    });
    Object.entries(els.tabs).forEach(([phase, tabEl]) => {
      const hasItems = checklistItems.some((item) => item.phase.toLowerCase() === phase);
      tabEl.hidden = !hasItems;
      els.panels[phase].hidden = !hasItems || phase !== "before";
    });
    els.checklistSection.hidden = false;
    if (wasReset) {
      // Non-blocking notice; keeps the flow simple per directive 1.3.
      els.checklistProgress.textContent += " (checklist reset after 30 days)";
    }
    FloodChecklist.renderPrintSummary({
      items: checklistItems,
      riskSummary,
      container: els.printSummary,
    });
  }

  els.printBtn.addEventListener("click", () => window.print());

  let lastLocation = null;
  let lastRiskSummary = null;

  // ---- Main pipeline (drives the tracker in directive 1.1) --------------
  async function runPipeline(location) {
    resetTracker();
    hideError();
    els.resultSection.hidden = true;
    els.resultSkeleton.hidden = false;
    els.resultCard.classList.add("result__card--loading");
    if (els.terrainPanel) els.terrainPanel.hidden = true;

    // Step 1: location — already resolved by caller, mark done immediately.
    setStep("location", "done");

    // Step 2: flood-zone check (client-side PIP, FR-2.1)
    setStep("zone", "active");
    let inFloodZone = false;
    try {
      if (!floodZones) floodZones = await loadFloodZones();
      const match = FloodPIP.findMatchingZone(location.lng, location.lat, floodZones);
      inFloodZone = !!match;
      setStep("zone", "done");
    } catch (e) {
      setStep("zone", "error");
      showError("We couldn't check flood-zone data. Check your connection and try again.", () => runPipeline(location));
      return;
    }

    // Step 2b: terrain — elevation-grid relief/slope + nearby mapped
    // waterway check (best-effort, finer-than-flood-zone-polygon signal).
    // Neither leg blocks the pipeline: if the elevation API or the
    // Overpass mirror is slow/unreachable, that signal just resolves to
    // "unavailable" (modifier 0) and the tier still comes from whatever
    // did come back, same graceful-degradation pattern as the seasonal
    // outlook below.
    setStep("terrain", "active");
    const tCfg = config.terrain || {};
    const wCfg = config.waterProximity || {};
    const gridRadiusM = tCfg.sampleRadiusM || 200;
    const gridPoints = FloodTerrain.buildSampleGrid(location.lat, location.lng, gridRadiusM, tCfg.sampleCount || 8);
    const searchRadiusM = wCfg.searchRadiusM || Math.max(600, (wCfg.nearM || 150) * 3);

    let terrainAnalysis = null;
    let terrainAdjustment = { modifier: 0, label: "unavailable" };
    let waterMatch = null;
    let waterAdjustment = { modifier: 0, label: "unavailable" };

    const [elevResult, waterResult] = await Promise.allSettled([
      fetchElevationGrid(gridPoints),
      fetchNearbyWaterways(location.lat, location.lng, searchRadiusM),
    ]);
    if (elevResult.status === "fulfilled") {
      terrainAnalysis = FloodTerrain.analyze(gridPoints, elevResult.value, gridRadiusM);
      terrainAdjustment = FloodTerrain.classify(terrainAnalysis, tCfg);
    }
    if (waterResult.status === "fulfilled") {
      waterMatch = FloodWaterway.nearest(location.lat, location.lng, waterResult.value);
      waterAdjustment = FloodWaterway.classify(waterMatch, wCfg);
    }
    setStep("terrain", "done"); // non-critical enhancement — never shown as an error step

    // Step 3: rainfall forecast (Open-Meteo, FR-2.2)
    setStep("forecast", "active");
    let rainfallMm, fetchedAt, stale = null;
    try {
      const forecast = await fetchForecast(location.lat, location.lng);
      rainfallMm = forecast.totalMm;
      fetchedAt = forecast.fetchedAt;
      cacheResult({ location, inFloodZone, rainfallMm, fetchedAt: forecast.fetchedAt });
      setStep("forecast", "done");
    } catch (e) {
      // FR-4.1: fall back to cached forecast (flagged stale) or a clear
      // "data unavailable" state with retry — never a blank screen.
      const cached = readCachedResult();
      if (cached && cached.location && locationKeyFor(cached.location) === locationKeyFor(location)) {
        rainfallMm = cached.rainfallMm;
        fetchedAt = cached.fetchedAt;
        inFloodZone = cached.inFloodZone;
        stale = relativeTime(cached.fetchedAt);
        setStep("forecast", "done");
      } else {
        setStep("forecast", "error");
        showError("We couldn't fetch the rainfall forecast, and no cached forecast is available for this location. Check your connection and try again.", () => runPipeline(location));
        return;
      }
    }

    let seasonalOutlook = null;
    try {
      seasonalOutlook = await fetchSeasonalOutlook(location.lat, location.lng);
    } catch (e) {
      // The long-range outlook is advisory; immediate risk still works if it is unavailable.
    }

    // Step 4: risk classification (config-driven, FR-2.3 / FR-2.4) —
    // now folding in the terrain + waterway local signals from step 2b.
    setStep("risk", "active");
    const { tier } = FloodRisk.classify({ rainfallMm, inFloodZone, config, terrainAdjustment, waterAdjustment });
    const terrainLabel = terrainAdjustment.modifier !== 0 ? FloodTerrain.TERRAIN_LABELS[terrainAdjustment.label] : null;
    const waterLabel = (waterAdjustment.modifier > 0 && waterMatch)
      ? `a mapped ${waterMatch.kind || "water feature"} is about ${Math.round(waterMatch.distanceM)}m away`
      : null;
    const reason = FloodRisk.explain({ rainfallMm, windowLabel: "next 24h", inFloodZone, terrainLabel, waterLabel });
    const recommendations = FloodRecommendations.build({
      tier,
      reliefM: terrainAnalysis && terrainAnalysis.reliefM,
      slopePercent: terrainAnalysis && terrainAnalysis.slopePercent,
      nearestWaterDistance: waterMatch && waterMatch.distanceM,
      waterAvailable: waterAdjustment.label === "unavailable" ? null : !waterMatch,
      inFloodZone,
      terrainConfig: tCfg,
      waterConfig: wCfg,
    });
    const countyProfile = config.countyRiskProfiles && config.countyRiskProfiles[location.county];
    const context = countyProfile
      ? `${location.county} is listed as a vulnerable flood region. This advisory does not replace the live Open-Meteo forecast.`
      : "This uses the current rain forecast and flood map for your area.";
    setStep("risk", "done");

    renderResult({
      tier,
      reason,
      context,
      rainfallMm,
      windowLabel: "Next 24 hours",
      inFloodZone,
      location,
      stale,
      fetchedAt,
      terrainAnalysis,
      terrainAdjustment,
      waterAdjustment,
      waterMatch,
      recommendations,
    });
    lastLocation = location;
    lastRiskSummary = { tierLabel: FloodRisk.TIER_LABELS[tier], reason };
    renderTerrainPanel({ analysis: terrainAnalysis, radiusM: gridRadiusM, location, terrainAdjustment, waterAdjustment, waterMatch });
    renderSeasonalOutlook(seasonalOutlook);

    bootstrapChecklist(location, {
      tierLabel: FloodRisk.TIER_LABELS[tier],
      reason,
    });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => runPipeline(location), REFRESH_MS);
  }

  // ---- Bootstrap: resolve location, then run pipeline --------------------
  async function start() {
    setStep("location", "active");
    try {
      const loc = await FloodGeo.detect();
      const geocode = await Promise.allSettled([FloodGeocoding.reverseGeocode(loc.lat, loc.lng)]);
      if (geocode[0].status === "fulfilled" && geocode[0].value) {
        loc.address = geocode[0].value.formattedAddress;
        loc.addressLevel = geocode[0].value.addressLevel;
      }
      await runPipeline(loc);
    } catch (reason) {
      setStep("location", "error");
      const hints = {
        denied: "Location access was denied.",
        timeout: "Finding your location is taking too long.",
        unsupported: "Your browser cannot find your location automatically.",
        error: "We could not find your location.",
      };
      await showManualLocation(hints[reason] || hints.error);
    }
  }

  els.useLocationBtn.addEventListener("click", () => {
    els.resultSection.hidden = true;
    start();
  });

  async function init() {
    initTheme();
    try {
      config = await loadConfig();
      els.configVersion.textContent = `Config v${config.version}`;
    } catch (e) {
      // Even without config, keep the app usable with safe built-in defaults.
      config = {
        version: "unknown",
        thresholds: { yellow: 20, orange: 50, red: 100 },
        zoneAdjustment: true,
        terrain: { enabled: false },
        waterProximity: { enabled: false },
        checklist: [],
      };
      els.configVersion.textContent = "Config unavailable — using defaults";
    }
    updateOfflineBadge();
    renderOfficialSources();
    if (mapboxToken()) FloodMap.load(mapboxToken());
    start();
  }

  document.addEventListener("DOMContentLoaded", init);

  // ---- Service worker registration (NFR-2: offline capability) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => {
        console.warn("Service worker registration failed:", e);
      });
    });
  }
})();
