# CA Property Tax per Acre

An explorable static web map of **annual property tax revenue per acre** for California
parcels, inspired by [ca-property-tax](https://github.com/typpo/ca-property-tax) but
rendering actual parcel polygons colored by tax yield instead of point markers.

Currently covers **San Francisco**; the pipeline is config-driven so more counties can be
added one `counties.yml` block at a time.

## How it works

```
Data/ca_all.csv (tax roll, per-APN)  ┐
                                     ├─ pipeline/ (Python) ─ join on APN, aggregate condos,
County GIS parcel polygons (Socrata) ┘                       compute acres (EPSG:3310), tax/acre
                                          │
                                          ├─ tippecanoe → site/data/tiles/<county>.pmtiles
                                          ├─ site/data/rankings/<county>.json (top/bottom 100)
                                          └─ site/highlights/<county>/index.html
site/ = fully static → MapLibre GL + PMTiles, no server required
```

## Setup

```bash
brew install tippecanoe pmtiles
python -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
```

Place the tax CSV at `Data/ca_all.csv` (columns: Address, Parcel Number, Longitude,
Latitude, Annual property tax, County code).

## Build a county

```bash
cd pipeline
./run_county.sh sf        # runs steps 01–07; QA report at build/sf/qa.json
```

Optional: set `SOCRATA_APP_TOKEN` to raise Socrata rate limits.

## Run locally

PMTiles needs HTTP Range support, which `python -m http.server` lacks:

```bash
npx serve site
```

## Adding a county

1. Add a block to `pipeline/counties.yml` (geometry source, join/footprint fields,
   tax-record URL template, map center).
2. Register an APN normalizer in `pipeline/lib/apn.py` mapping the tax CSV's APN format
   to the GIS join field's format.
3. If the county doesn't publish via Socrata, add a driver to `pipeline/lib/sources.py`
   (most CA counties use ArcGIS FeatureServer).
4. `./run_county.sh <county>` — the frontend picks it up from `site/data/counties.json`
   with no code changes.
