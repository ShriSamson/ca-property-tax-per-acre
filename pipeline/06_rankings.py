"""Emit top/bottom-100 rankings JSON and upsert the counties.json manifest.

Usage: python 06_rankings.py --county sf
"""
import argparse
import json

import geopandas as gpd

from lib import config


def entry(row) -> dict:
    c = row.geometry.representative_point()
    return {
        "apn": row.apn,
        "address": row.address,
        "neighborhood": row.neighborhood if str(row.neighborhood) != "nan" else None,
        "tax": round(row.tax_total, 2),
        "acres": round(row.acres, 5),
        "tpa": round(row.tax_per_acre, 1),
        "units": row.units,
        "lat": round(c.y, 6),
        "lng": round(c.x, 6),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    bdir = config.build_dir(args.county)
    parcels = gpd.read_parquet(bdir / "parcels.parquet")

    meta = json.loads((config.raw_dir() / f"{args.county}_parcels.meta.json").read_text())

    ranked = parcels[
        parcels["tax_total"].notna() & (parcels["tax_total"] > 0) & ~parcels["is_sliver"]
    ].sort_values("tax_per_acre", ascending=False)
    exempt = parcels[parcels["tax_total"] == 0]

    rankings = {
        "county": args.county,
        "name": cfg["name"],
        "top": [entry(r) for r in ranked.head(100).itertuples()],
        "bottom": [entry(r) for r in ranked.tail(100).iloc[::-1].itertuples()],
        "exempt_count": int(len(exempt)),
        "stats": {
            "parcels": int(len(parcels)),
            "with_tax": int(parcels["tax_total"].notna().sum()),
            "tax_total": round(float(parcels["tax_total"].sum()), 0),
            "median_tpa": round(float(ranked["tax_per_acre"].median()), 0),
        },
    }
    rdir = config.SITE_DIR / "data" / "rankings"
    rdir.mkdir(parents=True, exist_ok=True)
    (rdir / f"{args.county}.json").write_text(json.dumps(rankings, separators=(",", ":")))
    print(f"Wrote rankings for {cfg['name']}")

    manifest_path = config.SITE_DIR / "data" / "counties.json"
    manifest = {"counties": []}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
    manifest["counties"] = [c for c in manifest["counties"] if c["id"] != args.county]
    manifest["counties"].append({
        "id": args.county,
        "name": cfg["name"],
        "tiles": f"data/tiles/{args.county}.pmtiles",
        "center": cfg["center"],
        "zoom": cfg["zoom"],
        "minzoom": cfg["minzoom"],
        "taxRecordUrl": cfg["tax_record_url"],
        "city": cfg["city"],
        "taxNote": cfg.get("tax_note"),
        "vintage": {"tax": cfg.get("vintage_tax", "2020–21 roll"), "parcels": meta["data_as_of"]},
        "stats": rankings["stats"],
    })
    manifest["counties"].sort(key=lambda c: c["name"])
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"Updated {manifest_path}")


if __name__ == "__main__":
    main()
