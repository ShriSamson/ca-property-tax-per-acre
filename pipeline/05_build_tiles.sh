#!/bin/bash
# Build PMTiles for one county: ./05_build_tiles.sh sf
set -euo pipefail
COUNTY="${1:?usage: 05_build_tiles.sh <county>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"

mkdir -p "$ROOT/site/data/tiles"
tippecanoe -o "$ROOT/site/data/tiles/$COUNTY.pmtiles" -l parcels -f -P \
  -Z10 -z15 \
  --detect-shared-borders \
  --coalesce-smallest-as-needed \
  --simplification=8 --simplify-only-low-zooms \
  --extend-zooms-if-still-dropping \
  "$ROOT/build/$COUNTY/parcels.geojsonl"

ls -lh "$ROOT/site/data/tiles/$COUNTY.pmtiles"
