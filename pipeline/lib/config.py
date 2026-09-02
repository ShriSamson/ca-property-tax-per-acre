"""Load per-county configuration from counties.yml."""
from pathlib import Path

import yaml

PIPELINE_DIR = Path(__file__).resolve().parent.parent
ROOT = PIPELINE_DIR.parent
BUILD_DIR = ROOT / "build"
SITE_DIR = ROOT / "site"
DATA_CSV = ROOT / "Data" / "ca_all.csv"


class _NoDuplicatesLoader(yaml.SafeLoader):
    """yaml silently keeps the last duplicate key, which can splice one
    county's settings into another after a bad edit — fail loudly instead."""


def _construct_mapping(loader, node, deep=False):
    keys = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in keys:
            raise SystemExit(f"counties.yml: duplicate key '{key}' at line {key_node.start_mark.line + 1}")
        keys.add(key)
    return yaml.SafeLoader.construct_mapping(loader, node, deep)


_NoDuplicatesLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


def load_county(county_id: str) -> dict:
    with open(PIPELINE_DIR / "counties.yml") as f:
        counties = yaml.load(f, Loader=_NoDuplicatesLoader)
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
