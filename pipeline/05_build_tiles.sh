#!/bin/bash
# Build PMTiles for one county: ./05_build_tiles.sh sf
set -euo pipefail
COUNTY="${1:?usage: 05_build_tiles.sh <county>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"

mkdir -p "$ROOT/docs/data/tiles"
# Generous tile budget: the default 500KB forces low-zoom tiles to drop most
# small parcels, leaving only big (usually exempt) ones — misleading colors.
tippecanoe -o "$ROOT/docs/data/tiles/$COUNTY.pmtiles" -l parcels -f -P \
  -Z10 -z15 \
  --maximum-tile-bytes=2500000 \
  --detect-shared-borders \
  --coalesce-smallest-as-needed \
  --simplification=8 --simplify-only-low-zooms \
  --extend-zooms-if-still-dropping \
  "$ROOT/build/$COUNTY/parcels.geojsonl"

# Tiny centroid overview tileset for z8-11; polygons render from z12 up.
tippecanoe -o "$ROOT/docs/data/tiles/${COUNTY}_overview.pmtiles" -l overview -f -P \
  -Z8 -z11 -r1 \
  --drop-densest-as-needed \
  --maximum-tile-bytes=400000 \
  "$ROOT/build/$COUNTY/parcels_points.geojsonl"

ls -lh "$ROOT/docs/data/tiles/$COUNTY.pmtiles" "$ROOT/docs/data/tiles/${COUNTY}_overview.pmtiles"
