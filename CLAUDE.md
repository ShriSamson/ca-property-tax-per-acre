# CA Property Tax per Acre

Static web app mapping California property tax revenue per acre per parcel.
Live at https://shrisamson.github.io/ca-property-tax-per-acre/ (GitHub Pages
serving `docs/` on main). Covers San Francisco, Berkeley, and Alameda County.

## Architecture

- `pipeline/` — Python (runs in `.venv`), numbered steps 01–08 orchestrated by
  `./run_county.sh <county>`. Config-driven via `counties.yml`; each county
  declares geometry source, tax source, APN normalizer, zoning sources.
- `docs/` — the deployable static site (plain ES modules, no bundler):
  MapLibre GL + PMTiles map, canvas scatter plot, generated highlights pages.
- `build/` (gitignored) — intermediates. `Data/ca_all.csv` (gitignored, 607MB)
  is the 2020–21 scraped tax roll from Ian Webster's Kaggle dataset.
- Deploy = commit to main. `docs/.nojekyll` must exist (Jekyll otherwise
  mangles the site).

## Commands

- Full county build: `cd pipeline && ./run_county.sh sf`
- Local serve: `npx serve docs` (NOT `python -m http.server` — PMTiles needs
  HTTP Range support)
- Verify in browser via the dev-browser skill; MapLibre will NOT render in a
  hidden/background Chrome tab (rAF throttling) — use dev-browser, not the
  claude-in-chrome extension tabs.

## Hard-won gotchas (do not rediscover)

- `Data/ca_all.csv` has CRLF line endings; grep patterns need `\r?$` and
  naive pandas parsing of the whole file hangs — step 02 pre-filters by county
  code with grep.
- macOS git matches .gitignore case-insensitively: a bare `Data/` pattern
  silently swallowed `docs/data/` once. Keep ignore patterns root-anchored.
- ArcGIS paging: advance offset by rows RETURNED and stop only on an empty
  page — servers clamp page sizes (Hayward caps at 1000) and a short page is
  NOT the end. Both truncation and row-skipping happened.
- ArcGIS Online is full of impostor layers with plausible names from other
  states (an "Arizona zoning_districts", a Florida "Zoning"). ALWAYS
  bounds-check downloaded geometry against California (step 08 asserts this).
- Zoning codes collide across cities (Oakland RH-* = single-family hillside;
  Hayward RH = high-density; SF RH-2 = two-family). Categorization happens in
  `pipeline/lib/zoning.py` per source style, never generically client-side.
- Alameda County's 2025 tax-rates layer is truncated at exactly 10,000 rows
  (whole TRA ranges missing); step 02 backfills from the 2024 layer.
- Condo lots: SF groups by `mapblklot`; Alameda condos are stacked identical
  polygons grouped by geometry hash. Some register against tiny common-area
  slivers — rankings require ≥0.02 acres (map shows everything).
- Berkeley's Socrata zoning layer (`iknk-w4qw`) mislabels its CRS: actually
  NAD83/UTM 10N (EPSG:26910).
- `Math.min(...arr)` overflows the JS argument limit above ~120k elements —
  the scatter plot uses loops.
- GitHub Pages: 100MB/file hard cap. `alameda.pmtiles` is 94.8MB — the next
  large county must move tiles to Cloudflare R2 (manifest URLs make this a
  config change).
- counties.yml: duplicate YAML keys are rejected by a strict loader in
  `lib/config.py` (a duplicate-key splice once sent one county's config into
  another).

## Data semantics

- Tax vintages differ by county and are labeled everywhere: SF = 2020–21
  scraped bills (includes parcel taxes); Berkeley/Alameda = 2025–26
  ad-valorem computed from assessed value × TRA rate (EXCLUDES parcel
  taxes/special assessments — popups carry a note + ⓘ explainer).
- Colors: 10 discrete buckets, light blue → dark blue below $200k/acre,
  light yellow → amber above. Single source of truth: `docs/js/colors.js`
  (legend, map fills, 3D bars, scatter all derive from it).
- 3D bar height is purely linear: 120m per $1M/acre.
- Map minZoom is clamped to 10 (parcel tiles bottom out there; z10 fits the
  whole covered area on one screen). Full polygons/3D bars render at every
  zoom — a centroid-dot overview layer was tried and deliberately removed
  (user prefers heavy first load over bars turning into dots when zooming
  out, especially on mobile).

## Licensing

Code AGPL-3.0. SF-derived data CC BY-NC-SA 4.0 (attribution: Ian Webster's
Kaggle dataset / typpo/ca-property-tax). Keep the Attribution sections in
README.md and docs/about/ intact.
