"""Export footprint parcels as newline-delimited GeoJSON for tippecanoe.

Short property names keep tiles small:
  a=apn, ad=address, t=annual tax, ac=acres, tpa=tax per acre, u=units, n=neighborhood

Usage: python 04_export_geojson.py --county sf
"""
import argparse
import json

import geopandas as gpd
from shapely.geometry import mapping
from shapely import set_precision

from lib import config


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    bdir = config.build_dir(args.county)
    parcels = gpd.read_parquet(bdir / "parcels.parquet")
    out = bdir / "parcels.geojsonl"
    out_pts = bdir / "parcels_points.geojsonl"

    # Lightweight centroid layer for low zooms: full polygon tiles at z10-11
    # run to multiple MB per tile, which dominates first-load time.
    rp = parcels.geometry.representative_point()
    with open(out_pts, "w") as fpts:
        for row, x, y in zip(parcels.itertuples(), rp.x, rp.y):
            props = {}
            if row.tax_total is not None and row.tax_total == row.tax_total:
                props["t"] = round(row.tax_total, 2)
                props["tpa"] = round(row.tax_per_acre, 1)
            fpts.write(json.dumps({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(x, 6), round(y, 6)]},
                "properties": props,
            }, separators=(",", ":")) + "\n")

    n = 0
    with open(out, "w") as f:
        for row in parcels.itertuples():
            props = {
                "a": row.apn,
                "ad": row.address or "",
                "ac": round(row.acres, 5),
                "u": row.units,
            }
            if row.neighborhood and str(row.neighborhood) != "nan":
                props["n"] = row.neighborhood
            if row.tax_total is not None and row.tax_total == row.tax_total:
                props["t"] = round(row.tax_total, 2)
                props["tpa"] = round(row.tax_per_acre, 1)
            geom = set_precision(row.geometry, 1e-7)
            f.write(json.dumps({
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": props,
            }, separators=(",", ":")) + "\n")
            n += 1
    print(f"Wrote {n} features to {out} (+ centroids to {out_pts.name})")


if __name__ == "__main__":
    main()
