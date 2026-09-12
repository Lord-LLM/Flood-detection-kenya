# Flood Watch Kenya — PWA

A client-side-only Progressive Web App: flood risk lookup + a 23-item El Niño
preparedness checklist. Built to the project SRS — see the traceability table
at the bottom of this file.

## Run it

No build step, no backend. Any static file server works (a real HTTP server
is required — not `file://` — because service workers and `fetch()` of local
JSON/GeoJSON need an origin).

**Windows / PowerShell (no Python or Node needed):**

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
# then open http://localhost:8080 in your browser
```

This is a small zero-dependency static server included in this folder
(`serve.ps1`) — useful if your machine's Python install is misconfigured
(a broken `PYTHONHOME`/MSYS2 setup is a common cause of the
`ModuleNotFoundError: No module named 'encodings'` error) or Node isn't
installed. If port 8080 is busy: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8081`.

**macOS / Linux, or if you have a working Python:**

```bash
python3 -m http.server 8080
```

**If you have Node.js instead:**

```bash
npx serve . -l 8080
```

Or use VS Code's "Live Server" extension. For deployment, create the filtered
static bundle first so local credentials and editor history cannot be uploaded:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
```

Deploy `.dist` to any static host (Netlify, GitHub Pages, S3, etc.) — every
path in the app is relative, so it works from a sub-path too. The bundle
intentionally omits `config/keys.local.js`; production builds therefore use
the documented no-token fallback unless credentials are injected by a separate
deployment mechanism.

For Vercel, leave **Root Directory** empty and set the build command to
`node generate-keys.js`. Add the optional `MAPBOX_ACCESS_TOKEN` environment
variable in the Vercel project settings. The build writes the ignored
`config/keys.local.js` file expected by the app; when the variable is absent,
the app keeps its no-token fallback.

Geolocation requires a **secure context** (`https://` or `localhost`) — that's
a browser rule, not something this app can change.

## Optional: enable building-level search and map

The app works without a Mapbox token using GPS coordinates and the county ->
constituency -> ward fallback. To enable address, estate, landmark, and
interactive map features:

1. Create a [Mapbox account](https://account.mapbox.com/) and create a public
  access token.
2. In the token's URL restrictions, add `http://localhost:8080` and the real
  deployment domain. Keep the default public scopes required by Mapbox GL JS
  and Geocoding.
3. Copy `config/keys.local.js` from the included template and replace
  `PASTE_YOUR_PUBLIC_MAPBOX_TOKEN_HERE` with the token. This file is ignored by
  Git.

Mapbox tokens are necessarily visible in this client-only app. URL and scope
restrictions reduce misuse but do not make a public token secret.

The app uses Mapbox GL JS for the interactive map and Mapbox Geocoding API for
search and reverse lookup. Elevation remains on Open-Meteo and does not need a
Mapbox or Google elevation key.

## Project structure

```
Flood-terrain-aware/
├── index.html            App shell + all screens (tracker, result, checklist)
├── manifest.json          PWA manifest (installable, icons, theme color)
├── sw.js                  Service worker — offline app shell + forecast cache
├── css/styles.css         Design tokens + all styling (flat, no gradients)
├── js/
│   ├── pip.js             Point-in-polygon geometry (pure, unit-testable)
│   ├── risk.js             Rainfall + zone + terrain + water → risk tier logic (pure, unit-testable)
│   ├── terrain.js          Elevation-grid relief/slope analysis (pure, unit-testable)
│   ├── waterway.js         Nearest mapped water-feature geometry (pure, unit-testable)
│   ├── recommendations.js  Plain-language actions from risk signals (pure)
│   ├── checklist.js        Checklist render + localStorage persistence
│   ├── geolocation.js      W3C Geolocation + manual county fallback
│   ├── geocoding.js        Optional Mapbox reverse geocoding + search
│   ├── map.js              Optional Mapbox map + flood-zone overlay
│   └── app.js              Orchestration: wires the tracker + screens together, all fetch() calls
├── config/config.json     Versioned, editable risk thresholds + checklist content
├── data/
│   ├── counties.json       47 counties with approximate centroids (manual fallback)
│   ├── admin-units.json    Sample constituency/ward data for 3 counties
│   └── flood-zones.geojson SAMPLE flood-zone polygons — see limitation below
└── icons/                 Flat PNG app icons (192px, 512px)
```

## What's real vs. what's a placeholder

- **Open-Meteo forecast calls are real** — `js/app.js` hits the live public
  API (`api.open-meteo.com`, no key required) and sums the next 24h of
  hourly precipitation.
- **Geolocation is real** — uses the standard browser Geolocation API with a
  15s timeout before falling back to manual county selection.
- **Mapbox location features are optional, real API calls** — with a restricted
  public token, `js/geocoding.js` uses Mapbox Geocoding for GPS reverse lookup,
  address/building autocomplete, and place details. `js/map.js` loads Mapbox
  GL JS for a marker and the local flood-zone GeoJSON overlay. Without a token,
  these controls degrade to the existing county fallback and SVG terrain
  snapshot. The token is visible in browser source and is mitigated only by
  URL and scope restrictions.
- **Terrain and waterway lookups are real, live API calls** — `js/app.js`
  hits Open-Meteo's elevation endpoint (`api.open-meteo.com/v1/elevation`,
  same host as the forecast, no key) for the 9-point sample grid, and the
  public Overpass API (`overpass-api.de`) for nearby OpenStreetMap water
  features. Both are genuine, current data — not placeholders — but see
  "Limitations of the terrain/waterway signal" above: a 9-point sample and
  crowd-sourced waterway tagging are real inputs to a simple heuristic, not
  a substitute for authoritative hydrology.
- **Official advisories are links, not a fake feed** — the config-driven panel
  links to KMD, NDMA, and Kenya Red Cross. No free, authoritative live KMD or
  NDMA JSON feed is assumed here; this is the place to wire one in later.
- **`data/flood-zones.geojson` is illustrative placeholder data**, not the
  authoritative DRR/KMD dataset (SRS Assumption A1 — that dataset is
  published separately by the DRR team and wasn't available here). It has
  four simplified rectangular "sample" zones so the point-in-polygon logic
  and the risk-tier combination logic have something real to run against.
  **Replace this file with the official versioned GeoJSON before using this
  for real risk decisions.** The point-in-polygon code (`js/pip.js`) works
  against any valid GeoJSON `Polygon`/`MultiPolygon` FeatureCollection, so no
  code changes should be needed to swap the file.
- **County centroids in `data/counties.json` are approximate**, meant for a
  "close enough" manual fallback per FR-1.2, not survey-grade coordinates.
  Manual selection now goes deeper to constituency and ward where sample data
  exists in `data/admin-units.json`, then falls back to county. That file is
  deliberately incomplete; the full 47 -> 290 -> approximately 1,450 dataset
  must be sourced from IEBC or `opendata.go.ke` before production. See
  `data/NOTE.md`.

## How the risk decision works (FR-2.3 / FR-2.4)

`js/risk.js` is a pure, dependency-free module. Four signals combine into
one tier, in this order:

1. **Rainfall.** Next-24h rainfall (mm) maps to a base tier using
   `config.json → thresholds` (`< 20` Green, `20–50` Yellow, `50–100`
   Orange, `≥ 100` Red — matches the SRS boundary values exactly).
2. **Flood-zone membership.** If the location falls **outside** every mapped
   flood zone, the tier steps down one level (Red→Orange→Yellow→Green never
   goes below Green — unmapped land is lower, not zero, exposure). Disable
   via `"zoneAdjustment": false`.
3. **Local terrain** (`js/terrain.js`) — this is the "go finer than county"
   step. The app samples elevation at the centre point plus 8 points in a
   ring around it (`config.terrain.sampleRadiusM`, default 200m) from
   Open-Meteo's public elevation API — one batched request, no DEM file, no
   GIS library. From that it derives:
   - **Relief**: centre elevation minus the ring average. Negative means
     the point sits in a local bowl relative to its immediate surroundings.
   - **Slope**: the steepest ring point vs. the centre, as a percent grade.
   A flat local bowl (`reliefM ≤ lowPointReliefM` and `slopePercent <
   flatSlopePercent`) steps the tier **up** one — poor natural drainage. A
   steep, elevated spot (`reliefM ≥ elevatedReliefM` and `slopePercent ≥
   steepSlopePercent`) steps it **down** one — runoff drains away quickly.
   Anything in between is neutral. All four thresholds live in
   `config.json → terrain` (ops-editable, no redeploy).
4. **Waterway proximity** (`js/waterway.js`) — nearest mapped river,
   stream, water body, or spring from OpenStreetMap, fetched live via the
   public Overpass API for a small radius around the point. A feature found
   within `config.waterProximity.nearM` (default 150m) steps the tier **up**
   one. Consistent with the flood-zone rule, *no* nearby feature found is
   treated as "unknown", never as "safe" — OSM waterway coverage is
   incomplete in many rural areas, so absence of a match carries no signal.

Steps 3 and 4 are summed and clamped to a single step either way (net
`-1`/`0`/`+1`) before being applied, so terrain and waterway data can nudge
the rainfall + flood-zone result but never override it outright. Either one
degrades gracefully to "neutral" if its API call is slow or unreachable —
see `app.js → runPipeline`'s "terrain" step, which uses `Promise.allSettled`
so a failed elevation or Overpass lookup never blocks the pipeline the way
a failed forecast or flood-zone fetch does.

`FloodRisk.explain()` builds the one-sentence plain-language reason shown
on the result card, folding in the terrain/water clauses when they actually
moved the tier; the raw numbers (rainfall value, window, zone status,
elevation/relief, nearest water distance, location used) are one tap away
in the collapsible details panel — never shown as an unlabeled dump. The
result card is also followed by a small dependency-free SVG "local terrain
snapshot" (`app.js → renderTerrainSvg`) — a compass-style plot of the 8
sampled elevation points relative to the centre, plus a marker toward the
nearest mapped water feature if one was found within range. It's a
deliberately lightweight stand-in for a real map: pulling in a tile-based
map library would blow the ≤200KB/no-third-party-script budget (NFR-1,
NFR-6), so this reuses the same elevation/waterway data the risk engine
already fetched instead of loading a new dependency just to draw a picture.

This split (pure classification/geometry functions vs. `app.js` doing all
the DOM work and API calls) is what the SRS's unit-test IDs (TC-ALGO-01,
TC-SPAT-01) are meant to target directly, without needing a browser — and
now extends to `terrain.js`/`waterway.js`, which follow the exact same
pure-function pattern as `pip.js`/`risk.js`.

### Limitations of the terrain/waterway signal — read before relying on it

- This is a **relief/slope heuristic from a 9-point sample**, not a real
  hydrological model. It has no concept of upstream catchment area,
  drainage infrastructure, soil permeability, or built-over land — a paved,
  well-drained flat area and an unpaved swampy one look identical to it.
  Treat it as a nudge on top of the rainfall + flood-zone signal, exactly
  as it's implemented, not as a standalone verdict.
- Open-Meteo's elevation API is DEM-derived at coarser resolution than the
  200m sample radius used here in places, so in very flat terrain the
  relief/slope numbers can be noisier than they look.
- Overpass/OSM waterway coverage is patchy outside major towns — a "no
  nearby water feature found" result in a rural area is genuinely
  uninformative, which is why it's never used to lower the risk tier.
- For anything approaching a real hyper-local flood model, the right next
  step is the official DRR/KMD flood-zone GeoJSON (see below) plus a real
  DEM-based hydrology tool (e.g. TWI/flow-accumulation from SRTM), not more
  tuning of this heuristic.

### El Niño outlook vs. immediate risk

The risk tier is deliberately an immediate action signal: it uses the next
24 hours of Open-Meteo hourly precipitation plus the local flood-zone check.
The result also loads a separate 46-day ECMWF seasonal precipitation outlook
from Open-Meteo for El Niño preparedness planning. The seasonal service says
its data is an area-level, non-bias-corrected outlook, so it is shown as
planning guidance and does not replace local warnings or the immediate tier.

The implementation follows the published [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs),
[Seasonal Forecast API](https://open-meteo.com/en/docs/seasonal-forecast-api),
and [Global Flood API](https://open-meteo.com/en/docs/flood-api) documentation.

## Config-driven content (FR-4.2)

Everything an ops/DRR reviewer would need to change without a code
redeploy lives in `config/config.json`: risk thresholds, the
zone-adjustment rule, and all 23 checklist items (text + phase). The
active `version` string is shown in the app footer for auditability, per
the SRS's Change Control section.

## Offline behaviour (NFR-2) & stale data (FR-4.1)

- The service worker caches the app shell, config, county list, and flood
  zone GeoJSON on install — the checklist and last-known result work fully
  offline.
- The last successful forecast result is separately cached in
  `localStorage` (see `app.js → cacheResult`). If a forecast fetch fails for
  the same location, the app shows that cached result with an explicit
  "Showing cached forecast from Xh ago" note rather than a blank screen or
  silent failure.
- If there's no cache to fall back to, the app shows a plain error panel
  with a **Retry** button.

## Accessibility & performance notes (NFR-1, NFR-3, NFR-4, NFR-5)

- No custom web fonts (system font stack only) and no UI framework — kept
  deliberately lean toward the ≤200KB / FCP ≤1.5s targets, and to avoid
  relying on JS features that may not exist on KaiOS 2.5.
- All interactive controls have labels/`aria-*` attributes; the tracker,
  tabs, and details panel use proper ARIA roles/states; focus is always
  visible (`:focus-visible`); `prefers-reduced-motion` is respected.
- Color is never the only signal: every risk tier also has a text label and
  an icon-style dot, and checklist completion also uses strikethrough text.
- Print layout (`@media print`) hides all interactive chrome and renders a
  compact risk summary + full checklist meant to fit on two A4 pages.

## Traceability

| Requirement | Where |
|---|---|
| FR-1.1, FR-1.2 | `js/geolocation.js`, `js/geocoding.js`, manual-location panel in `index.html` |
| FR-2.1 | `js/pip.js` |
| FR-2.2 | `js/app.js → fetchForecast()` |
| FR-2.3, FR-2.4 | `js/risk.js`, `js/terrain.js`, `js/waterway.js`, result card + details panel + terrain snapshot |
| FR-3.1–FR-3.4 | `js/checklist.js`, `config/config.json`, print stylesheet |
| FR-4.1 | `js/app.js` error/retry + stale-cache handling |
| FR-4.2 | `config/config.json`, footer version display |
| NFR-1, NFR-4 | no web fonts / no framework, minimal asset list in `sw.js`, SVG remains the no-key terrain fallback |
| NFR-2 | `sw.js` caches only the static shell and Open-Meteo responses; Google responses are never cached |
| NFR-3 | ARIA attributes throughout `index.html`, contrast-checked palette in `css/styles.css`, terrain SVG has an `aria-label` |
| NFR-5 | plain ES2017-level JS, no bundler-only syntax, system fonts |
| NFR-6 | no analytics or framework; optional Google calls, Open-Meteo, and Overpass/OSM are disclosed and best-effort |

## Known gaps / next steps for a production rollout

- Swap in the real DRR/KMD flood-zone GeoJSON and re-verify the
  point-in-polygon logic against the official reference oracle (TC-SPAT-01).
- Replace the sample `data/admin-units.json` entries with the authoritative
  IEBC or `opendata.go.ke` 47 -> 290 -> approximately 1,450 dataset. The
  cascading picker and county-only fallback are real; the data is still a
  placeholder.
- Validate the new plain-language recommendations and sharing/last-checked
  workflow with field users on small phones.
- Phase 5 (optional): add one Netlify/Vercel serverless proxy so the Google
  key is stored server-side rather than exposed to the browser. Do not treat
  this static client as able to hide a key.
- The terrain/waterway signal (`js/terrain.js`, `js/waterway.js`) is a
  9-point relief/slope heuristic plus OSM waterway tagging — real data, but
  not a real hydrology model. See "Limitations of the terrain/waterway
  signal" above before treating it as authoritative. A production rollout
  should validate its thresholds (`config.json → terrain` /
  `waterProximity`) against known local flood incidents, and consider
  swapping in a proper DEM-based flow-accumulation/TWI layer if that
  validation shows the heuristic isn't earning its keep.
- Add the automated test suite referenced by the SRS's test-case IDs
  (TC-GEO-01/02, TC-SPAT-01, TC-API-01, TC-ALGO-01/02, TC-CHK-01/02,
  TC-STO-01, TC-PRN-01, TC-ERR-01, TC-CFG-01, TC-PERF-01/02, TC-PWA-01,
  TC-A11Y-01, TC-COMP-01, TC-PRIV-01) — `risk.js`, `pip.js`, `terrain.js`,
  and `waterway.js` are all written as pure functions specifically so this
  is straightforward.
- Run a real Lighthouse/axe-core pass against a deployed build to confirm
  NFR-1 and NFR-3 numerically, and test on an actual KaiOS 2.5 device for
  NFR-5.
