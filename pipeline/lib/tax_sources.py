"""Alternate per-county tax data sources (beyond the master scrape CSV).

alameda_roll: computes current-year ad-valorem tax from Alameda County's
ArcGIS secured-roll layer (net taxable value per APN) joined to the
per-TRA rate table (sum of 1% base + bond override funds). Excludes
direct levies / parcel taxes — flag via the county's tax_note.
"""
import numpy as np
import pandas as pd
import requests

PAGE_SIZE = 2000


def _arcgis_rows(url: str, where: str, out_fields: list[str]) -> pd.DataFrame:
    params_base = {
        "where": where,
        "outFields": ",".join(out_fields),
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": PAGE_SIZE,
        "orderByFields": "OBJECTID",
    }
    rows = []
    offset = 0
    while True:
        resp = requests.get(f"{url}/query", params=dict(params_base, resultOffset=offset), timeout=300)
        resp.raise_for_status()
        feats = resp.json()["features"]
        rows.extend(f["attributes"] for f in feats)
        print(f"  fetched {len(feats)} rows at offset {offset}")
        if len(feats) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return pd.DataFrame(rows)


def alameda_roll(ts_cfg: dict, normalize, qa) -> pd.DataFrame:
    roll = _arcgis_rows(
        ts_cfg["roll_url"],
        ts_cfg.get("where", "1=1"),
        ["Print_Parcel", "TRA_Primary", "TRA_Secondary", "Total_Net_Value",
         "Situs_Street_Number", "Situs_Street_Name"],
    )
    qa.add("roll_rows", len(roll))

    rates = _arcgis_rows(ts_cfg["rates_url"], "1=1", ["TRA_PRIM", "TRA_SEC", "TAX_RATE"])
    tra_rate = rates.groupby(["TRA_PRIM", "TRA_SEC"])["TAX_RATE"].sum()
    qa.add("tra_count", len(tra_rate))
    qa.add("tra_rate_range", [round(float(tra_rate.min()), 6), round(float(tra_rate.max()), 6)])

    roll["_prim"] = pd.to_numeric(roll["TRA_Primary"], errors="coerce")
    roll["_sec"] = pd.to_numeric(roll["TRA_Secondary"], errors="coerce")
    roll["rate"] = roll.set_index(["_prim", "_sec"]).index.map(tra_rate)
    qa.add("rows_missing_rate", int(roll["rate"].isna().sum()))

    net = pd.to_numeric(roll["Total_Net_Value"], errors="coerce").clip(lower=0)
    roll["tax"] = (net * roll["rate"]).round(2)
    roll["apn"] = roll["Print_Parcel"].astype(str).map(normalize)
    roll["address"] = (
        roll["Situs_Street_Number"].fillna("").astype(str).str.strip()
        + " "
        + roll["Situs_Street_Name"].fillna("").astype(str).str.strip()
    ).str.strip()
    roll["lat"] = np.nan
    roll["lng"] = np.nan
    return roll[["apn", "address", "tax", "lat", "lng"]]
