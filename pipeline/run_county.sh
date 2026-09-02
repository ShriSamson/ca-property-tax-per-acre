#!/bin/bash
# Full pipeline for one county: ./run_county.sh sf
set -euo pipefail
COUNTY="${1:?usage: run_county.sh <county>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$DIR/../.venv/bin/python"

cd "$DIR"
"$PY" 01_download_geometry.py --county "$COUNTY"
"$PY" 02_prepare_tax.py --county "$COUNTY"
"$PY" 03_join_and_metrics.py --county "$COUNTY"
"$PY" 04_export_geojson.py --county "$COUNTY"
./05_build_tiles.sh "$COUNTY"
"$PY" 06_rankings.py --county "$COUNTY"
"$PY" 07_render_highlights.py --county "$COUNTY"
"$PY" 08_scatter_data.py --county "$COUNTY"
