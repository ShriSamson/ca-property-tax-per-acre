"""Emit top/bottom-100 rankings JSON and upsert the counties.json manifest.

Counties with `city_pages: true` also get one rankings file per city
(grouped by the neighborhood field, which holds SitusCity for Alameda),
listed under the manifest entry's `cities` for the highlights pages.

Usage: python 06_rankings.py --county sf
"""
import argparse
import json
import re

import geopandas as gpd

from lib import config, enrich

MIN_CITY_PARCELS = 300
# Some condo complexes register units against a tiny common-area sliver,
# producing absurd tax/acre; no building stands on under ~870 sq ft.
MIN_RANK_ACRES = 0.02


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


def build_rankings(page_id: str, name: str, parcels, cfg: dict, link_city: str) -> dict:
    ranked = parcels[
        parcels["tax_total"].notna() & (parcels["tax_total"] > 0)
        & (parcels["acres"] >= MIN_RANK_ACRES)
    ].sort_values("tax_per_acre", ascending=False)
    exempt = parcels[parcels["tax_total"] == 0]

    top = [entry(r) for r in ranked.head(100).itertuples()]
    bottom = [entry(r) for r in ranked.tail(100).iloc[::-1].itertuples()]
    descriptions = enrich.describe(cfg, top + bottom)
    for e in top + bottom:
        e["desc"] = descriptions.get(e["apn"])

    stats = {
        "parcels": int(len(parcels)),
        "with_tax": int(parcels["tax_total"].notna().sum()),
        "tax_total": round(float(parcels["tax_total"].sum()), 0),
        "median_tpa": round(float(ranked["tax_per_acre"].median()), 0) if len(ranked) else 0,
    }
    rankings = {
        "id": page_id,
        "name": name,
        "linkCity": link_city,
        "taxRecordUrl": cfg["tax_record_url"],
        "taxNote": cfg.get("tax_note"),
        "top": top,
        "bottom": bottom,
        "exempt_count": int(len(exempt)),
        "stats": stats,
    }
    rdir = config.SITE_DIR / "data" / "rankings"
    rdir.mkdir(parents=True, exist_ok=True)
    (rdir / f"{page_id}.json").write_text(json.dumps(rankings, separators=(",", ":")))
    print(f"Wrote rankings for {name} ({len(top)} top / {len(bottom)} bottom, "
          f"{len(descriptions)} descriptions)")
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    bdir = config.build_dir(args.county)
    parcels = gpd.read_parquet(bdir / "parcels.parquet")
    meta = json.loads((config.raw_dir() / f"{args.county}_parcels.meta.json").read_text())

    stats = build_rankings(args.county, cfg["name"], parcels, cfg, cfg["city"])

    cities = []
    if cfg.get("city_pages"):
        for city, sub in parcels.groupby("neighborhood"):
            city = str(city).strip()
            if not city or city == "nan" or len(sub) < MIN_CITY_PARCELS:
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
            page_id = f"{args.county}-{slug}"
            # Addresses already embed the city for these counties.
            city_stats = build_rankings(page_id, city.title(), sub, cfg, "CA")
            cities.append({"id": page_id, "name": city.title(), "stats": city_stats})
        cities.sort(key=lambda c: c["name"])

    manifest_path = config.SITE_DIR / "data" / "counties.json"
    manifest = {"counties": []}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
    manifest["counties"] = [c for c in manifest["counties"] if c["id"] != args.county]
    manifest["counties"].append({
        "id": args.county,
        "name": cfg["name"],
        "tiles": f"data/tiles/{args.county}.pmtiles",
        "tilesOverview": f"data/tiles/{args.county}_overview.pmtiles",
        "center": cfg["center"],
        "zoom": cfg["zoom"],
        "minzoom": cfg["minzoom"],
        "taxRecordUrl": cfg["tax_record_url"],
        "city": cfg["city"],
        "taxNote": cfg.get("tax_note"),
        "vintage": {"tax": cfg.get("vintage_tax", "2020–21 roll"), "parcels": meta["data_as_of"]},
        "stats": stats,
        "cities": cities,
    })
    manifest["counties"].sort(key=lambda c: c["name"])
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"Updated {manifest_path}")


if __name__ == "__main__":
    main()
