"""Emit compact per-city scatter data: one point per taxed lot.

Point format: [annual tax, acres, lat, lng, apn] — kept terse because the
biggest cities are ~100k lots. Page ids match the rankings/highlights ids.

Usage: python 08_scatter_data.py --county sf
"""
import argparse
import json
import re

import geopandas as gpd

from lib import config


def dump(page_id: str, name: str, parcels):
    sub = parcels[parcels["tax_total"].notna() & (parcels["acres"] > 0)]
    rp = sub.geometry.representative_point()
    pts = [
        [round(t), round(a, 5), round(y, 5), round(x, 5), apn]
        for t, a, y, x, apn in zip(sub["tax_total"], sub["acres"], rp.y, rp.x, sub["apn"])
    ]
    out_dir = config.SITE_DIR / "data" / "scatter"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{page_id}.json").write_text(
        json.dumps({"name": name, "points": pts}, separators=(",", ":"))
    )
    print(f"scatter {page_id}: {len(pts)} points")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    parcels = gpd.read_parquet(config.build_dir(args.county) / "parcels.parquet")

    dump(args.county, cfg["name"], parcels)
    if cfg.get("city_pages"):
        for city, sub in parcels.groupby("neighborhood"):
            city = str(city).strip()
            if not city or city == "nan" or len(sub) < 300:
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
            dump(f"{args.county}-{slug}", city.title(), sub)


if __name__ == "__main__":
    main()
