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
                                          ├─ tippecanoe → docs/data/tiles/<county>.pmtiles
                                          ├─ docs/data/rankings/<county>.json (top/bottom 100)
                                          └─ docs/highlights/<county>/index.html
docs/ = fully static → MapLibre GL + PMTiles, no server required
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
npx serve docs
```

## Attribution & licenses

- **Code**: [AGPL-3.0](LICENSE). This project is inspired by and structured after
  [typpo/ca-property-tax](https://github.com/typpo/ca-property-tax) (AGPL-3.0) by
  Ian Webster, which pioneered the scraped statewide dataset and map.
- **Scraped tax data** (San Francisco 2020–21 amounts): from the
  [California Property Taxes 2020 dataset](https://www.kaggle.com/datasets/iwebst/california-property-taxes-2020)
  by Ian Webster on Kaggle, licensed **CC BY-NC-SA 4.0**. Derived artifacts built
  from it (SF tiles, rankings, scatter data) carry the same license: attribution
  required, non-commercial use only, share-alike.
- **County-sourced data**: parcel boundaries, assessed-value rolls, tax rates, and
  zoning districts come from DataSF, the City of Berkeley, Alameda County, and the
  cities of Oakland, Hayward, and Emeryville — public records via their open data
  portals.
- **Basemap**: [OpenFreeMap](https://openfreemap.org) tiles ©
  [OpenMapTiles](https://openmaptiles.org), data ©
  [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
  Satellite imagery © Esri, Maxar, Earthstar Geographics.

## Adding a county

1. Add a block to `pipeline/counties.yml` (geometry source, join/footprint fields,
   tax-record URL template, map center).
2. Register an APN normalizer in `pipeline/lib/apn.py` mapping the tax CSV's APN format
   to the GIS join field's format.
3. If the county doesn't publish via Socrata, add a driver to `pipeline/lib/sources.py`
   (most CA counties use ArcGIS FeatureServer).
4. `./run_county.sh <county>` — the frontend picks it up from `docs/data/counties.json`
   with no code changes.
