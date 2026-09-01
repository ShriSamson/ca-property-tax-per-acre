// Renders the top/bottom-100 rankings tables for a county highlights page.
// The page sets window.COUNTY_ID before loading this module.
import { fmtMoney, realEstateUrl, streetViewUrl, taxRecordUrl } from "./popup.js";

const countyId = window.COUNTY_ID;
const [manifest, rankings] = await Promise.all([
  fetch("../../data/counties.json").then((r) => r.json()),
  fetch(`../../data/rankings/${countyId}.json`).then((r) => r.json()),
]);
const county = manifest.counties.find((c) => c.id === countyId);

function row(e, i) {
  const mapLink = `../../#map=17/${e.lat}/${e.lng}&sel=${encodeURIComponent(e.apn)}`;
  return `<tr>
    <td class="num">${i + 1}</td>
    <td><a href="${mapLink}">${e.address || "(no address)"}</a>${
      e.units > 1 ? ` <span class="muted">(${e.units} units)</span>` : ""
    }</td>
    <td>${e.neighborhood || ""}</td>
    <td class="num">${fmtMoney(e.tax)}</td>
    <td class="num">${e.acres.toFixed(3)}</td>
    <td class="num">${fmtMoney(e.tpa)}</td>
    <td><a href="${realEstateUrl(e.address, county.city)}" target="_blank" rel="noopener">RE</a>
        <a href="${streetViewUrl(e.address, county.city, e.lat, e.lng)}" target="_blank" rel="noopener">SV</a>
        <a href="${taxRecordUrl(county.taxRecordUrl, e.apn)}" target="_blank" rel="noopener">Tax</a></td>
  </tr>`;
}

function renderTable(entries) {
  return `<table class="rank-table">
    <thead><tr><th class="num">#</th><th>Address</th><th>Neighborhood</th>
    <th class="num">Annual tax</th><th class="num">Acres</th><th class="num">Tax / acre</th><th>Links</th></tr></thead>
    <tbody>${entries.map(row).join("")}</tbody></table>`;
}

const container = document.getElementById("rankings");
const tabs = document.querySelectorAll(".tabs button");
function show(which) {
  tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === which));
  container.innerHTML = renderTable(which === "top" ? rankings.top : rankings.bottom);
}
tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
show("top");

const s = rankings.stats;
document.getElementById("stats").textContent =
  `${s.with_tax.toLocaleString()} taxed parcels · ${fmtMoney(s.tax_total)} total annual tax · ` +
  `median ${fmtMoney(s.median_tpa)}/acre · ${rankings.exempt_count.toLocaleString()} exempt ($0) parcels`;
