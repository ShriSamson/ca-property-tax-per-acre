"""Parse the master tax CSV, filter to one county, normalize APNs, dedupe.

The master CSV is 8.5M rows; parsing it all in pandas is slow, so we
pre-filter with grep to the target county's rows (they end in ",<CODE>")
and parse only those.

Usage: python 02_prepare_tax.py --county sf
"""
import argparse
import io
import subprocess

import pandas as pd

from lib import config
from lib.apn import get_normalizer
from lib.qa import QAReport


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    qa = QAReport("02_prepare_tax")

    print(f"Filtering {config.DATA_CSV} to {cfg['csv_code']} rows...")
    header = subprocess.run(
        ["head", "-1", str(config.DATA_CSV)], capture_output=True, text=True, check=True
    ).stdout
    # The CSV has CRLF line endings, so allow an optional \r before end-of-line.
    grep = subprocess.run(
        ["grep", "-E", f",{cfg['csv_code']}\r?$", str(config.DATA_CSV)],
        capture_output=True, text=True, check=True,
    ).stdout
    df = pd.read_csv(
        io.StringIO(header + grep),
        skipinitialspace=True,
        dtype={"Parcel Number": str, "County code": str},
        on_bad_lines="warn",
        low_memory=False,
    )
    df.columns = [c.strip() for c in df.columns]

    df["County code"] = df["County code"].astype(str).str.strip()
    df = df[df["County code"] == cfg["csv_code"]].copy()
    qa.add("county_rows", len(df))

    normalize = get_normalizer(cfg["apn_normalizer"])
    df["apn"] = df["Parcel Number"].map(normalize)
    df["tax"] = pd.to_numeric(df["Annual property tax"], errors="coerce")
    df["address"] = df["Address"].astype(str).str.strip()
    df["lat"] = pd.to_numeric(df["Latitude"], errors="coerce")
    df["lng"] = pd.to_numeric(df["Longitude"], errors="coerce")

    bad_tax = df["tax"].isna() | (df["tax"] < 0)
    qa.add("rows_dropped_bad_tax", int(bad_tax.sum()))
    df = df[~bad_tax]

    before = len(df)
    df = df.drop_duplicates(subset=["apn", "tax"])
    qa.add("exact_dupes_dropped", before - len(df))

    # Same APN with different tax amounts: keep the max, log how many.
    multi = df["apn"].duplicated(keep=False)
    qa.add("apns_with_conflicting_tax", int(df.loc[multi, "apn"].nunique()))
    if multi.any():
        qa.add_samples("conflicting_tax_apn_samples", df.loc[multi, "apn"].unique(), 20)
    df = df.sort_values("tax", ascending=False).drop_duplicates(subset=["apn"], keep="first")

    qa.add("rows_out", len(df))
    qa.add("tax_sum", round(float(df["tax"].sum()), 2))

    out = config.build_dir(args.county) / "tax.parquet"
    df[["apn", "address", "tax", "lat", "lng"]].to_parquet(out, index=False)
    qa.save(config.build_dir(args.county) / "qa.json")
    print(f"Saved {len(df)} tax records to {out}")


if __name__ == "__main__":
    main()
