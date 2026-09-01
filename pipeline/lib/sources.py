"""Geometry source drivers. Currently: Socrata (SODA GeoJSON endpoint).

An ArcGIS FeatureServer driver will be added when the first non-Socrata
county lands.
"""
import os
import time

import geopandas as gpd
import pandas as pd
import requests

PAGE_SIZE = 50_000
MAX_RETRIES = 5


def _get_with_retry(url: str, params: dict, headers: dict) -> requests.Response:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=300)
            if resp.status_code in (429, 500, 502, 503):
                raise requests.HTTPError(f"HTTP {resp.status_code}")
            resp.raise_for_status()
            return resp
        except (requests.RequestException, requests.HTTPError) as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt * 5
            print(f"  request failed ({e}), retrying in {wait}s...")
            time.sleep(wait)


def download_socrata(geom_cfg: dict) -> gpd.GeoDataFrame:
    """Page through a Socrata SODA GeoJSON endpoint and return one GeoDataFrame."""
    url = f"https://{geom_cfg['domain']}/resource/{geom_cfg['dataset']}.geojson"
    headers = {}
    token = os.environ.get("SOCRATA_APP_TOKEN")
    if token:
        headers["X-App-Token"] = token

    params_base = {
        "$limit": PAGE_SIZE,
        "$order": ":id",
        "$select": ",".join(geom_cfg["select"]),
    }
    if geom_cfg.get("where"):
        params_base["$where"] = geom_cfg["where"]

    pages = []
    offset = 0
    while True:
        params = dict(params_base, **{"$offset": offset})
        resp = _get_with_retry(url, params, headers)
        page = gpd.read_file(resp.text)
        print(f"  fetched {len(page)} rows at offset {offset}")
        if len(page) == 0:
            break
        pages.append(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    gdf = gpd.GeoDataFrame(pd.concat(pages, ignore_index=True), crs=pages[0].crs)
    return gdf


def fetch_data_as_of(geom_cfg: dict) -> str:
    """Ask the Socrata metadata API when the dataset was last updated."""
    url = f"https://{geom_cfg['domain']}/api/views/{geom_cfg['dataset']}.json"
    try:
        meta = requests.get(url, timeout=60).json()
        ts = meta.get("rowsUpdatedAt") or meta.get("viewLastModified")
        if ts:
            return time.strftime("%Y-%m-%d", time.gmtime(ts))
    except requests.RequestException:
        pass
    return "unknown"


def download(geom_cfg: dict) -> gpd.GeoDataFrame:
    if geom_cfg["type"] == "socrata":
        return download_socrata(geom_cfg)
    raise SystemExit(f"Unknown geometry source type '{geom_cfg['type']}'")
