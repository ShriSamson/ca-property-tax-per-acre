"""Render the per-county highlights page from a Jinja2 template.

Usage: python 07_render_highlights.py --county sf
"""
import argparse

from jinja2 import Environment, FileSystemLoader

from lib import config


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", required=True)
    args = ap.parse_args()

    cfg = config.load_county(args.county)
    env = Environment(loader=FileSystemLoader(config.PIPELINE_DIR / "templates"))
    tpl = env.get_template("highlights.html.j2")

    out_dir = config.SITE_DIR / "highlights" / args.county
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "index.html").write_text(tpl.render(county_id=args.county, county_name=cfg["name"]))
    print(f"Rendered {out_dir / 'index.html'}")


if __name__ == "__main__":
    main()
