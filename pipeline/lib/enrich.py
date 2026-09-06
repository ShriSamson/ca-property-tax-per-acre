"""Short property descriptions for ranked parcels, from county assessor data.

Each driver takes the list of ranking entries and returns {apn: description},
kept to ~10 words (assessor use-class names are already terse).
"""
import time

import requests


def _chunks(items, n):
    for i in range(0, len(items), n):
        yield items[i : i + n]


def _arcgis_query(url: str, params: dict) -> list:
    """POST (long IN-clauses overflow GET URLs) with one retry; [] on failure."""
    for attempt in range(2):
        try:
            resp = requests.post(url + "/query", data=params, timeout=120)
            resp.raise_for_status()
            return resp.json()["features"]
        except (requests.RequestException, ValueError, KeyError) as e:
            if attempt == 0:
                time.sleep(3)
            else:
                print(f"  enrich query failed, skipping chunk: {e}")
    return []


def alameda_use_codes(ts_cfg: dict, entries: list[dict]) -> dict:
    """Use_Code per APN from the roll layer + the county's code→name table."""
    codes = {}
    for f in _arcgis_query(ts_cfg["use_codes_url"], {
        "where": "1=1", "outFields": "Use_Code,Use_Code_Common_Name",
        "resultRecordCount": 2000, "f": "json",
    }):
        codes[str(f["attributes"]["Use_Code"]).strip()] = f["attributes"]["Use_Code_Common_Name"].strip()

    out = {}
    apns = [e["apn"] for e in entries]
    for chunk in _chunks(apns, 100):
        quoted = ",".join(f"'{a}'" for a in chunk)
        for f in _arcgis_query(ts_cfg["roll_url"], {
            "where": f"Print_Parcel IN ({quoted})",
            "outFields": "Print_Parcel,Use_Code",
            "returnGeometry": "false", "f": "json",
        }):
            a = f["attributes"]
            desc = codes.get(str(a["Use_Code"]).strip())
            if desc:
                out[a["Print_Parcel"].strip().upper()] = desc
    return out


def sf_roll(cfg: dict, entries: list[dict]) -> dict:
    """Latest use class + year built from DataSF's secured assessor roll."""
    out = {}
    apns = [e["apn"] for e in entries]
    for chunk in _chunks(apns, 100):
        quoted = ",".join(f"'{a}'" for a in chunk)
        resp = requests.get(
            "https://data.sfgov.org/resource/wv5m-vpq2.json",
            params={
                "$select": "parcel_number,property_class_code_definition,year_property_built,"
                           "max(closed_roll_year)",
                "$where": f"parcel_number in({quoted})",
                "$group": "parcel_number,property_class_code_definition,year_property_built",
                "$limit": 5000,
            },
            timeout=120,
        )
        best = {}
        for r in resp.json():
            apn = r["parcel_number"]
            year = r.get("max_closed_roll_year", "0")
            if apn not in best or year > best[apn][0]:
                best[apn] = (year, r)
        for apn, (_, r) in best.items():
            desc = (r.get("property_class_code_definition") or "").strip()
            built = (r.get("year_property_built") or "").strip()
            if desc:
                if built.isdigit() and 1850 <= int(built) <= 2026:
                    desc += f", built {built}"
                out[apn.upper()] = desc
    return out


def arcgis_field(cfg: dict, entries: list[dict]) -> dict:
    """Use-class text straight off a field of the county's parcel layer
    (e.g. San Mateo's PUCDESC), fetched per-APN for the ranked entries."""
    g = cfg["geometry"]
    field = cfg["description_field"]
    out = {}
    for chunk in _chunks([e["apn"] for e in entries], 100):
        quoted = ",".join(f"'{a}'" for a in chunk)
        for f in _arcgis_query(g["url"], {
            "where": f"{g['join_field']} IN ({quoted})",
            "outFields": f"{g['join_field']},{field}",
            "returnGeometry": "false", "f": "json",
        }):
            a = f["attributes"]
            desc = (a.get(field) or "").strip()
            if desc:
                if desc.isupper():
                    desc = desc.title()
                out[str(a[g["join_field"]]).strip().upper()] = desc
    return out


def describe(cfg: dict, entries: list[dict]) -> dict:
    source = cfg.get("description_source")
    if source == "alameda_use_codes":
        return alameda_use_codes(cfg["tax_source"], entries)
    if source == "sf_roll":
        return sf_roll(cfg, entries)
    if source == "arcgis_field":
        return arcgis_field(cfg, entries)
    return {}
