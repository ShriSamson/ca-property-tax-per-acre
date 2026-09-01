// Shared popup/link builders used by both the map and the highlights pages.

export function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtAcres(acres) {
  const sqft = acres * 43560;
  const sqftStr = Math.round(sqft).toLocaleString("en-US") + " sq ft";
  if (acres >= 0.1) return `${acres.toFixed(2)} acres (${sqftStr})`;
  return `${acres.toFixed(4)} acres (${sqftStr})`;
}

// Direct Zillow deep links get bot-blocked; a Google search scoped to the
// big listing sites reliably surfaces the property page instead.
export function realEstateUrl(address, city) {
  const q = `${address}, ${city} (site:zillow.com OR site:redfin.com)`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// Coordinate-based pano links snap to the nearest panorama, which for
// parcel-interior points is often a user photosphere or nothing. The
// address-pinned place page reliably surfaces official Street View imagery
// of the property, so prefer it whenever we have an address.
export function streetViewUrl(address, city, lat, lng) {
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ", " + city)}`;
  }
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function taxRecordUrl(template, apn) {
  return template.replace("{apn}", encodeURIComponent(apn));
}

// p: {a, ad, t, ac, tpa, u, n} — tile/rankings properties. county: manifest entry.
export function popupHtml(p, county, lat, lng) {
  const hasTax = p.tpa != null || p.t === 0;
  const condoNote =
    p.u > 1 ? `<div class="popup-note">Condo building — ${p.u} tax lots aggregated</div>` : "";
  const rows = [
    ["Annual tax", fmtMoney(p.t)],
    ["Lot size", p.ac != null ? fmtAcres(p.ac) : "—"],
    ["Tax / acre", hasTax ? fmtMoney(p.tpa ?? 0) : "no data"],
  ];
  const links = [
    [realEstateUrl(p.ad, county.city), "Real estate"],
    [streetViewUrl(p.ad, county.city, lat, lng), "Street View"],
    [taxRecordUrl(county.taxRecordUrl, p.a), "Tax record"],
  ];
  return `
    <div class="popup">
      <div class="popup-addr">${p.ad || "(no address)"}</div>
      <div class="popup-apn">APN ${p.a}${p.n ? " · " + p.n : ""}</div>
      ${condoNote}
      <table class="popup-table">${rows
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join("")}</table>
      <div class="popup-links">${links
        .map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`)
        .join(" · ")}</div>
    </div>`;
}
