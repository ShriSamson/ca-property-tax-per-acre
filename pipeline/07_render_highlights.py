"""Render highlights pages: one for the county entry, plus one per city
page listed in the manifest (from counties with city_pages: true).

Usage: python 07_render_highlights.py --county sf
"""
import argparse
import json

from jinja2 import Environment, FileSystemLoader

from lib import config


def render(env, page_id: str, name: str):
    tpl = env.get_template("highlights.html.j2")
    out_dir = config.SITE_DIR / "highlights" / page_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "index.html").write_text(tpl.render(county_id=page_id, county_name=name))
    print(f"Rendered {out_dir / 'index.html'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    env = Environment(loader=FileSystemLoader(config.PIPELINE_DIR / "templates"))

    render(env, args.county, cfg["name"])

    manifest = json.loads((config.SITE_DIR / "data" / "counties.json").read_text())
    county = next((c for c in manifest["counties"] if c["id"] == args.county), None)
    for city in (county or {}).get("cities", []):
        render(env, city["id"], city["name"])


if __name__ == "__main__":
    main()
