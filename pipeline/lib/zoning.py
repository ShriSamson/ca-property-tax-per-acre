"""Roll city-specific zoning codes up to shared categories.

Codes collide across cities (Oakland's RH-* is single-family hillside while
SF's RH-2 is two-family and Hayward's RH is high-density multi-family), so
each source declares a `style` and categorization happens here, per source,
at build time. Categories: sfr, mfr, mixed, com, ind, pub, other.
"""
import re


def _generic(c: str) -> str:
    if c in ("P", "PUB", "X") or c.startswith("P-"):
        return "pub"
    if re.match(r"^(PDR|M-1|M-2|MM|MRD|MU-LI|MULI|SALI|SLI|M$)", c):
        return "ind"
    if "MU" in c or c.startswith(("UMU", "WMU")):
        return "mixed"
    if re.match(r"^(RH-1|R-1|R1|ES-R)", c):
        return "sfr"
    if re.match(r"^(RH|RM|RTO|RC|RED|RSD|R-|SI)", c):
        return "mfr"
    if re.match(r"^(C|NC)", c):
        return "com"
    return "other"


def _oakland(c: str) -> str:
    if c.startswith(("RH", "RD")):
        return "sfr"
    if c.startswith(("RM", "RU")):
        return "mfr"
    if c.startswith(("CN", "CC", "CR")):
        return "com"
    if c.startswith(("CIX", "IG", "IO", "M-")):
        return "ind"
    if c.startswith(("HBX", "D-")):
        return "mixed"
    if c.startswith("OS"):
        return "pub"
    return "other"


def _hayward(c: str) -> str:
    if c == "COUNTY":  # placeholder polygons for unincorporated pockets
        return ""
    if c.startswith("RS"):
        return "sfr"
    if c.startswith(("RM", "RH", "RN")):
        return "mfr"
    if c.startswith(("CN", "CO", "CG", "CB", "CC", "CR")):
        return "com"
    if c.startswith(("IL", "IG", "IP", "I-")):
        return "ind"
    if c.startswith(("MB", "T3", "T4", "T5", "T6")):  # form-based Mission Blvd codes
        return "mixed"
    if c.startswith(("OS", "PF", "A")):
        return "pub"
    return "other"


def _emeryville(c: str) -> str:
    if c.startswith(("RM", "RH")):
        return "mfr"  # Emeryville has no single-family zoning at all
    if c.startswith("MU"):
        return "mixed"
    if c.startswith("OT"):
        return "com"
    if c.startswith("IN"):
        return "ind"
    if c in ("P", "PO", "UT", "SM", "M"):
        return "pub"
    return "other"


STYLES = {
    "generic": _generic,
    "sf": _generic,
    "berkeley": _generic,
    "oakland": _oakland,
    "hayward": _hayward,
    "emeryville": _emeryville,
}


def categorize(code: str, style: str) -> str:
    c = (code or "").strip().upper()
    if not c:
        return ""
    return STYLES.get(style, _generic)(c)
