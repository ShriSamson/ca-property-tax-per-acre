#!/bin/bash
# Build PMTiles for one county: ./05_build_tiles.sh sf
set -euo pipefail
COUNTY="${1:?usage: 05_build_tiles.sh <county>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"

mkdir -p "$ROOT/site/data/tiles"
# Generous tile budget: the default 500KB forces low-zoom tiles to drop most
# small parcels, leaving only big (usually exempt) ones — misleading colors.
tippecanoe -o "$ROOT/site/data/tiles/$COUNTY.pmtiles" -l parcels -f -P \
  -Z10 -z15 \
  --maximum-tile-bytes=2500000 \
  --detect-shared-borders \
  --coalesce-smallest-as-needed \
  --simplification=8 --simplify-only-low-zooms \
  --extend-zooms-if-still-dropping \
  "$ROOT/build/$COUNTY/parcels.geojsonl"

ls -lh "$ROOT/site/data/tiles/$COUNTY.pmtiles"
