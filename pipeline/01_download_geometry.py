"""Download parcel geometry for a county and cache as GeoParquet.

Usage: python 01_download_geometry.py --county sf [--force]
"""
import argparse
import json

from lib import config, sources


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    ap.add_argument("--force", action="store_true", help="re-download even if cached")
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    out = config.raw_dir() / f"{args.county}_parcels.parquet"
    meta_out = config.raw_dir() / f"{args.county}_parcels.meta.json"

    if out.exists() and not args.force:
        print(f"Cached geometry exists at {out}; use --force to re-download.")
        return

    source = cfg["geometry"].get("domain") or cfg["geometry"].get("url")
    print(f"Downloading {cfg['name']} parcels from {source}...")
    gdf = sources.download(cfg["geometry"])
    data_as_of = sources.fetch_data_as_of(cfg["geometry"])

    gdf.to_parquet(out)
    meta_out.write_text(json.dumps({"data_as_of": data_as_of, "rows": len(gdf)}))
    print(f"Saved {len(gdf)} parcels to {out} (data as of {data_as_of})")


if __name__ == "__main__":
    main()
