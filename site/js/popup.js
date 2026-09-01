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

export function zillowUrl(address, zillowCity) {
  return `https://www.zillow.com/homes/${encodeURIComponent(address + ", " + zillowCity)}_rb/`;
}

export function streetViewUrl(lat, lng) {
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
    [zillowUrl(p.ad, county.zillowCity), "Zillow"],
    [streetViewUrl(lat, lng), "Street View"],
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
