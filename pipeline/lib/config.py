"""Load per-county configuration from counties.yml."""
from pathlib import Path

import yaml

PIPELINE_DIR = Path(__file__).resolve().parent.parent
ROOT = PIPELINE_DIR.parent
BUILD_DIR = ROOT / "build"
SITE_DIR = ROOT / "site"
DATA_CSV = ROOT / "Data" / "ca_all.csv"


def load_county(county_id: str) -> dict:
    with open(PIPELINE_DIR / "counties.yml") as f:
        counties = yaml.safe_load(f)
    if county_id not in counties:
        raise SystemExit(f"Unknown county '{county_id}'. Known: {', '.join(counties)}")
    cfg = counties[county_id]
    cfg["id"] = county_id
    return cfg


def build_dir(county_id: str) -> Path:
    d = BUILD_DIR / county_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def raw_dir() -> Path:
    d = BUILD_DIR / "raw"
    d.mkdir(parents=True, exist_ok=True)
    return d
