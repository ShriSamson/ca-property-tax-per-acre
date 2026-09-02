"""Emit compact per-city scatter data: one point per taxed lot.

Point format: [annual tax, acres, lat, lng, apn, address, zone] — kept
terse because the biggest cities are ~100k lots. Page ids match the
rankings/highlights ids. Zone comes from a point-in-polygon join against
the city's zoning districts layer when one is configured.

Usage: python 08_scatter_data.py --county sf
"""
import argparse
import json
import re

import geopandas as gpd

from lib import config, sources


def attach_zoning(cfg: dict, county_id: str, parcels):
    z = cfg.get("zoning")
    if not z:
        parcels["zone"] = ""
        return
    cache = config.raw_dir() / f"{county_id}_zoning.parquet"
    if cache.exists():
        zones = gpd.read_parquet(cache)
    else:
        print(f"Downloading zoning districts for {county_id}...")
        if z["type"] == "socrata_geojson":
            zones = gpd.read_file(z["url"])
            if z.get("source_crs"):
                zones = zones.set_crs(z["source_crs"], allow_override=True)
        elif z["type"] == "arcgis":
            zones = sources.download_arcgis({**z, "select": [z["code_field"]], "where": "1=1"})
        else:
            raise SystemExit(f"Unknown zoning source type '{z['type']}'")
        zones.to_parquet(cache)
    zones = zones[[z["code_field"], "geometry"]].rename(columns={z["code_field"]: "zone"})

    pts = gpd.GeoDataFrame(
        {"i": range(len(parcels))}, geometry=parcels.geometry.representative_point(),
        crs=parcels.crs,
    )
    joined = gpd.sjoin(pts, zones.to_crs(parcels.crs), how="left", predicate="within")
    joined = joined[~joined.index.duplicated()]  # boundary points can hit two districts
    parcels["zone"] = joined["zone"].fillna("").values
    matched = (parcels["zone"] != "").sum()
    print(f"zoning: {matched}/{len(parcels)} parcels matched a district")


def dump(page_id: str, name: str, parcels):
    sub = parcels[parcels["tax_total"].notna() & (parcels["acres"] > 0)]
    rp = sub.geometry.representative_point()
    pts = [
        [round(t), round(a, 5), round(y, 5), round(x, 5), apn, ad or "", z or ""]
        for t, a, y, x, apn, ad, z in zip(
            sub["tax_total"], sub["acres"], rp.y, rp.x, sub["apn"], sub["address"], sub["zone"]
        )
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
    attach_zoning(cfg, args.county, parcels)

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
