// Renders the top/bottom-100 rankings tables for a county highlights page,
// with sortable columns and a hover mini-map showing parcel location.
// The page sets window.COUNTY_ID before loading this module.
import { fmtMoney, realEstateUrl, streetViewUrl, taxRecordUrl, aiSearchUrl } from "./popup.js";
import { fillColorExpression } from "./colors.js";

const countyId = window.COUNTY_ID;
const [manifest, rankings] = await Promise.all([
  fetch("../../data/counties.json").then((r) => r.json()),
  fetch(`../../data/rankings/${countyId}.json`).then((r) => r.json()),
]);
const county = manifest.counties.find((c) => c.id === countyId);

const SORT_KEYS = { tax: "tax", acres: "acres", tpa: "tpa" };
let currentTab = "top";
let sort = null; // {key, dir} — null = original rank order

function row(e, i) {
  const mapLink = `../../#map=17/${e.lat}/${e.lng}&sel=${encodeURIComponent(e.apn)}`;
  return `<tr>
    <td class="num">${i + 1}</td>
    <td><a href="${mapLink}" class="addr-link" data-lat="${e.lat}" data-lng="${e.lng}">${e.address || "(no address)"}</a>${
      e.units > 1 ? ` <span class="muted">(${e.units} units)</span>` : ""
    }${e.desc ? `<div class="desc muted">${e.desc}</div>` : ""}</td>
    <td>${e.neighborhood || ""}</td>
    <td class="num">${fmtMoney(e.tax)}</td>
    <td class="num">${e.acres.toFixed(3)}</td>
    <td class="num">${fmtMoney(e.tpa)}</td>
    <td><a href="${realEstateUrl(e.address, county.city)}" target="_blank" rel="noopener">RE</a>
        <a href="${streetViewUrl(e.address, county.city, e.lat, e.lng)}" target="_blank" rel="noopener">SV</a>
        <a href="${taxRecordUrl(county.taxRecordUrl, e.apn)}" target="_blank" rel="noopener">Tax</a>
        <a href="${aiSearchUrl(e.address, county.city)}" target="_blank" rel="noopener">AI</a></td>
  </tr>`;
}

function arrow(key) {
  if (sort?.key !== key) return `<span class="sort-arrow">↕</span>`;
  return `<span class="sort-arrow active">${sort.dir === "asc" ? "▲" : "▼"}</span>`;
}

function render() {
  let entries = [...(currentTab === "top" ? rankings.top : rankings.bottom)];
  if (sort) {
    const k = SORT_KEYS[sort.key];
    entries.sort((a, b) => (sort.dir === "asc" ? a[k] - b[k] : b[k] - a[k]));
  }
  document.getElementById("rankings").innerHTML = `<table class="rank-table">
    <thead><tr><th class="num">#</th><th>Address</th><th>Neighborhood</th>
    <th class="num sortable" data-sort="tax">Annual tax ${arrow("tax")}</th>
    <th class="num sortable" data-sort="acres">Acres ${arrow("acres")}</th>
    <th class="num sortable" data-sort="tpa">Tax / acre ${arrow("tpa")}</th>
    <th>Links</th></tr></thead>
    <tbody>${entries.map(row).join("")}</tbody></table>`;
}

document.getElementById("rankings").addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const key = th.dataset.sort;
  sort = sort?.key === key
    ? sort.dir === "desc" ? { key, dir: "asc" } : null  // desc → asc → off
    : { key, dir: "desc" };
  render();
});

const tabs = document.querySelectorAll(".tabs button");
tabs.forEach((b) =>
  b.addEventListener("click", () => {
    currentTab = b.dataset.tab;
    tabs.forEach((x) => x.classList.toggle("active", x === b));
    sort = null;
    render();
  })
);
render();

const s = rankings.stats;
document.getElementById("stats").textContent =
  `${s.with_tax.toLocaleString()} taxed parcels · ${fmtMoney(s.tax_total)} total annual tax · ` +
  `median ${fmtMoney(s.median_tpa)}/acre · ${rankings.exempt_count.toLocaleString()} exempt ($0) parcels`;

// ---- Hover mini-map --------------------------------------------------------
let mini = null;
let miniMarker = null;

function ensureMiniMap() {
  if (mini) return mini;
  const protocol = new pmtiles.Protocol();
  try { maplibregl.addProtocol("pmtiles", protocol.tile); } catch {}
  mini = new maplibregl.Map({
    container: "minimap",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: county.center,
    zoom: 15,
    interactive: false,
    attributionControl: false,
  });
  mini.on("load", () => {
    for (const c of manifest.counties) {
      mini.addSource(`p-${c.id}`, {
        type: "vector",
        url: `pmtiles://${new URL("../../" + c.tiles, location.href).href}`,
      });
      mini.addLayer({
        id: `p-${c.id}-fill`,
        type: "fill",
        source: `p-${c.id}`,
        "source-layer": "parcels",
        paint: { "fill-color": fillColorExpression(), "fill-opacity": 0.65 },
      });
    }
  });
  miniMarker = new maplibregl.Marker({ color: "#d7191c" });
  return mini;
}

const miniEl = document.getElementById("minimap");
document.getElementById("rankings").addEventListener("mouseover", (e) => {
  const link = e.target.closest("a.addr-link");
  if (!link) return;
  const lat = parseFloat(link.dataset.lat);
  const lng = parseFloat(link.dataset.lng);
  const rect = link.getBoundingClientRect();
  miniEl.style.display = "block";
  miniEl.style.left = `${Math.min(rect.right + 16, window.innerWidth - 300)}px`;
  miniEl.style.top = `${Math.min(rect.top - 60, window.innerHeight - 220)}px`;
  const m = ensureMiniMap();
  m.resize();
  m.jumpTo({ center: [lng, lat], zoom: 15.5 });
  miniMarker.setLngLat([lng, lat]).addTo(m);
});
document.getElementById("rankings").addEventListener("mouseout", (e) => {
  if (e.target.closest("a.addr-link")) miniEl.style.display = "none";
});
