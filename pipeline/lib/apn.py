"""Per-county APN normalizers.

Each normalizer maps a raw APN string from the tax CSV to the exact string
used by the county's GIS join field. Register new counties here.
"""


def normalize_sf(apn: str) -> str:
    # SF APNs are DataSF blklot strings (block+lot concatenated). Letters can
    # appear in both block ("4591A028") and lot ("1134002A") parts, so the APN
    # is opaque — no splitting or zero-padding.
    return apn.strip().upper()


def normalize_alameda(apn: str) -> str:
    # Alameda APNs are dashed book-block-lot(-sub) strings ("1-257-103",
    # "48-7104-1-2") and match the GIS APN field verbatim.
    return apn.strip().upper()


def normalize_digits(apn: str) -> str:
    # San Mateo (9-digit) and Santa Clara (8-digit) APNs are undashed digit
    # strings with leading zeros in both the tax CSV and the county GIS layers.
    return apn.strip().upper()


NORMALIZERS = {
    "sf": normalize_sf,
    "alameda": normalize_alameda,
    "san_mateo": normalize_digits,
    "santa_clara": normalize_digits,
}


def get_normalizer(key: str):
    if key not in NORMALIZERS:
        raise SystemExit(f"No APN normalizer registered for '{key}'")
    return NORMALIZERS[key]
