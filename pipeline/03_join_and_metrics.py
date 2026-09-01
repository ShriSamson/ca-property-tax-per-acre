"""Join tax records to parcel geometry, aggregate condo lots to physical
footprints, compute acreage (EPSG:3310) and tax per acre.

Usage: python 03_join_and_metrics.py --county sf
"""
import argparse

import geopandas as gpd
import numpy as np
import pandas as pd

from lib import config
from lib.qa import QAReport

SQM_PER_ACRE = 4046.8564224
SLIVER_ACRES = 30 / 43560  # ~30 sq ft; excluded from rankings, kept on map


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    bdir = config.build_dir(args.county)
    qa = QAReport("03_join_and_metrics")

    geom = gpd.read_parquet(config.raw_dir() / f"{args.county}_parcels.parquet")
    tax = pd.read_parquet(bdir / "tax.parquet")
    gcfg = cfg["geometry"]
    join_field = gcfg["join_field"]
    address_fields = gcfg.get("address_fields", [])
    neighborhood_field = gcfg.get("neighborhood_field")
    is_subset = bool(cfg.get("subset"))

    geom[join_field] = geom[join_field].astype(str).str.strip().str.upper()
    geom = geom[geom.geometry.notna() & ~geom.geometry.is_empty].copy()
    # A handful of parcels appear twice in some sources; keep one geometry each.
    geom = geom.drop_duplicates(subset=[join_field])
    qa.add("geometry_rows", len(geom))

    # Footprint key for condo aggregation: an explicit field (SF's mapblklot),
    # or a hash of the geometry where condo lots are stacked identical polygons.
    if gcfg.get("footprint_field"):
        footprint_field = gcfg["footprint_field"]
        geom[footprint_field] = geom[footprint_field].astype(str).str.strip().str.upper()
    elif gcfg.get("footprint_strategy") == "geometry":
        footprint_field = "_fp_key"
        geom[footprint_field] = pd.util.hash_array(geom.geometry.to_wkb().values).astype(str)
    else:
        footprint_field = join_field

    merged = geom.merge(tax, left_on=join_field, right_on="apn", how="left")
    matched_apns = set(merged.loc[merged["tax"].notna(), "apn"])
    unmatched = [a for a in tax["apn"] if a not in matched_apns]
    join_rate = (len(tax) - len(unmatched)) / len(tax)
    geom_match_rate = merged["tax"].notna().sum() / len(geom)
    qa.add("tax_apns_total", len(tax))
    qa.add("tax_apns_matched", len(tax) - len(unmatched))
    qa.add("join_rate", round(join_rate, 4))
    qa.add("geometry_match_rate", round(float(geom_match_rate), 4))
    if not is_subset:
        qa.add_samples("unmatched_apn_samples", unmatched, 50)

    def street_address(row):
        parts = [row.get(f) for f in address_fields]
        return " ".join(str(p) for p in parts if p and str(p) != "nan").strip()

    uses_field_key = footprint_field != "_fp_key"
    groups = []
    dissolve_fallbacks = 0
    for fp, g in merged.groupby(footprint_field):
        taxed = g[g["tax"].notna()]
        if uses_field_key:
            base = g[g[join_field] == fp]
            if len(base):
                geometry = base.iloc[0].geometry
            else:
                dissolve_fallbacks += 1
                geometry = g.geometry.union_all()
            apn = fp
        else:
            # Geometry-keyed groups are stacked identical polygons; any row's
            # geometry works, and the group is labeled by its first APN.
            geometry = g.iloc[0].geometry
            apn = taxed.iloc[0]["apn"] if len(taxed) else g.iloc[0][join_field]
        if len(taxed):
            address = taxed.iloc[0]["address"]
        else:
            address = street_address(g.iloc[0])
        groups.append({
            "apn": apn,
            "address": address,
            "neighborhood": g.iloc[0].get(neighborhood_field) if neighborhood_field else None,
            "tax_total": float(taxed["tax"].sum()) if len(taxed) else None,
            "units": int(len(taxed)),
            "geometry": geometry,
        })

    parcels = gpd.GeoDataFrame(groups, geometry="geometry", crs=merged.crs)
    qa.add("footprints", len(parcels))
    qa.add("dissolve_fallbacks", dissolve_fallbacks)
    qa.add("footprints_no_tax", int(parcels["tax_total"].isna().sum()))

    area_sqm = parcels.geometry.to_crs(epsg=3310).area
    parcels["acres"] = area_sqm / SQM_PER_ACRE
    parcels["tax_per_acre"] = np.where(
        parcels["tax_total"].notna() & (parcels["acres"] > 0),
        parcels["tax_total"] / parcels["acres"],
        np.nan,
    )
    parcels["is_sliver"] = parcels["acres"] < SLIVER_ACRES

    qa.add("total_acres", round(float(parcels["acres"].sum()), 1))
    qa.add("parcels_over_500_acres", int((parcels["acres"] > 500).sum()))
    qa.add("sliver_count", int(parcels["is_sliver"].sum()))
    qa.add("area_percentiles_acres", {
        p: round(float(parcels["acres"].quantile(p / 100)), 4) for p in (1, 25, 50, 75, 99)
    })
    # Conservation: matched tax must survive aggregation exactly.
    tax_in = float(tax.loc[tax["apn"].isin(matched_apns), "tax"].sum())
    tax_out = float(parcels["tax_total"].sum())
    qa.add("tax_sum_matched_in", round(tax_in, 2))
    qa.add("tax_sum_aggregated_out", round(tax_out, 2))
    qa.add("tax_conserved", abs(tax_in - tax_out) < 1.0)

    out = bdir / "parcels.parquet"
    parcels.to_parquet(out)
    qa.save(bdir / "qa.json")
    print(f"Saved {len(parcels)} footprints to {out}")
    # For city subsets most county tax rows legitimately don't match, so gate
    # on how much of the *geometry* got tax data instead.
    if is_subset:
        if geom_match_rate < 0.92:
            print(f"WARNING: only {geom_match_rate:.1%} of parcels matched tax data (target 92%)")
    elif join_rate < 0.92:
        print(f"WARNING: join rate {join_rate:.1%} below 92% target — inspect unmatched samples in qa.json")


if __name__ == "__main__":
    main()
