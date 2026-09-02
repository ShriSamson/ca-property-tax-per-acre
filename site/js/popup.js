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

// Google AI Mode (udm=50) asking about the property.
export function aiSearchUrl(address, city) {
  const q = `What property is at ${address}, ${city}?`;
  return `https://www.google.com/search?udm=50&q=${encodeURIComponent(q)}`;
}

const INFO_HTML = `
  <div class="info-card">
    <button class="info-close" aria-label="Close">&times;</button>
    <h3>What is ad-valorem tax?</h3>
    <p><em>Ad valorem</em> ("according to value") is the part of a California
    property tax bill charged as a percentage of the property's <strong>assessed
    value</strong>: a 1% base rate set by Proposition 13, plus locally approved
    bond rates — about 1.23% total in central Berkeley. Under Prop 13 the
    assessed value is set at the purchase price and can grow at most 2% per
    year until the property is sold.</p>
    <p>The amount shown here is computed from the county's published 2025–26
    assessed-value roll and each parcel's tax-rate-area rate. Real bills also
    include <strong>parcel taxes and special assessments</strong> (schools,
    library, parks, EMS — usually flat or per-square-foot charges that don't
    depend on value), which aren't included, so an actual Berkeley bill is
    typically 20–30% higher than the ad-valorem amount alone.</p>
  </div>`;

// One shared modal + delegated click handling (popup DOM is recreated per click).
function ensureInfoModal() {
  if (document.getElementById("info-modal")) return;
  const modal = document.createElement("div");
  modal.id = "info-modal";
  modal.className = "info-modal";
  modal.innerHTML = INFO_HTML;
  document.body.appendChild(modal);
  document.addEventListener("click", (e) => {
    if (e.target.closest(".popup-info-btn")) modal.classList.add("open");
    else if (e.target.closest(".info-close") || e.target === modal) modal.classList.remove("open");
  });
}
ensureInfoModal();

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
    [aiSearchUrl(p.ad, county.city), "AI search"],
  ];
  return `
    <div class="popup">
      <div class="popup-addr">${p.ad || "(no address)"}</div>
      <div class="popup-apn">APN ${p.a}${p.n ? " · " + p.n : ""}</div>
      ${condoNote}
      <table class="popup-table">${rows
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join("")}</table>
      ${county.taxNote ? `<div class="popup-note">${county.taxNote}
        <button class="popup-info-btn" title="What does ad-valorem tax mean?" aria-label="Explain ad-valorem tax">&#9432;</button></div>` : ""}
      <div class="popup-links">${links
        .map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`)
        .join(" · ")}</div>
    </div>`;
}
