// Scatter view: one dot per taxed lot. X = annual tax (log), Y = lot size
// (log, inverted so small lots are at the top) — high tax/acre = top right.
import { popupHtml } from "./popup.js";

const MARGIN = { top: 24, right: 70, bottom: 46, left: 64 };

const select = document.getElementById("city-select");
const colorSelect = document.getElementById("color-select");
const canvas = document.getElementById("scatter");
const tip = document.getElementById("scatter-tip");
const legendEl = document.getElementById("scatter-legend");
const ctx = canvas.getContext("2d");

// Zoning categories shared across cities' code systems (SF + Berkeley).
const ZONE_CATEGORIES = [
  { key: "sfr", label: "Residential – low density", color: "#4daf4a" },
  { key: "mfr", label: "Residential – multi-family", color: "#377eb8" },
  { key: "mixed", label: "Mixed-use", color: "#984ea3" },
  { key: "com", label: "Commercial", color: "#e41a1c" },
  { key: "ind", label: "Industrial / PDR", color: "#a65628" },
  { key: "pub", label: "Public / green space", color: "#666666" },
  { key: "other", label: "Other / unknown", color: "#cccccc" },
];
const CAT_COLOR = Object.fromEntries(ZONE_CATEGORIES.map((c) => [c.key, c.color]));

function zoneCategory(code) {
  const c = (code || "").toUpperCase();
  if (!c) return "other";
  if (c === "P" || c === "PUB" || c === "X" || c.startsWith("P-")) return "pub";
  if (/^(PDR|M-1|M-2|MM|MRD|MU-LI|MULI|SALI|SLI|M$)/.test(c)) return "ind";
  if (c.includes("MU") || c.startsWith("UMU") || c.startsWith("WMU")) return "mixed";
  if (/^(RH-1|R-1|R1|ES-R)/.test(c)) return "sfr";
  if (/^(RH|RM|RTO|RC|RED|RSD|R-|SI)/.test(c)) return "mfr";
  if (/^(C|NC)/.test(c)) return "com";
  return "other";
}

const manifest = await (await fetch("../data/counties.json")).json();
const options = [];
for (const c of manifest.counties) {
  options.push({ id: c.id, name: c.name + (c.cities?.length ? " (entire county)" : "") });
  for (const city of c.cities || []) options.push({ id: city.id, name: city.name });
}
options.sort((a, b) => a.name.localeCompare(b.name));
select.innerHTML = options.map((o) => `<option value="${o.id}">${o.name}</option>`).join("");

let points = [];
let view = null; // {x0, x1, a0, a1, w, h} log-space extents + pixel size
let grid = new Map(); // pixel-bucket index for hover

function log10(v) {
  return Math.log(v) / Math.LN10;
}

function layout() {
  const wrap = canvas.parentElement.getBoundingClientRect();
  const w = wrap.width - 24;
  const h = window.innerHeight - 190;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function draw() {
  const { w, h } = layout();
  ctx.clearRect(0, 0, w, h);
  if (!points.length) return;

  // No spread here: Math.min(...arr) overflows the argument limit >~120k points.
  let tMin = Infinity, tMax = 0, aMin = Infinity, aMax = 0;
  for (const p of points) {
    if (p[0] > 0) { if (p[0] < tMin) tMin = p[0]; if (p[0] > tMax) tMax = p[0]; }
    if (p[1] < aMin) aMin = p[1];
    if (p[1] > aMax) aMax = p[1];
  }
  const x0 = Math.floor(log10(Math.max(10, tMin)));
  const x1 = Math.ceil(log10(tMax));
  const a0 = Math.floor(log10(Math.max(0.001, aMin)));
  const a1 = Math.ceil(log10(aMax));
  const px = MARGIN.left, py = MARGIN.top;
  const pw = w - MARGIN.left - MARGIN.right, ph = h - MARGIN.top - MARGIN.bottom;
  view = { x0, x1, a0, a1, px, py, pw, ph };

  const X = (tax) => px + ((log10(tax) - x0) / (x1 - x0)) * pw;
  // Inverted: small acreage at the top.
  const Y = (ac) => py + ((log10(ac) - a0) / (a1 - a0)) * ph;

  // Gridlines + axis labels at powers of ten.
  ctx.font = "11px -apple-system, sans-serif";
  ctx.strokeStyle = "#eee";
  ctx.fillStyle = "#888";
  for (let e = x0; e <= x1; e++) {
    const x = X(10 ** e);
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py + ph); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText("$" + fmtPow(e), x, py + ph + 18);
  }
  for (let e = a0; e <= a1; e++) {
    const y = Y(10 ** e);
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(fmtPow(e) + " ac", px - 6, y + 4);
  }
  ctx.save();
  ctx.translate(14, py + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#555";
  ctx.fillText("Lot size (smaller ↑)", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillText("Annual tax", px + pw / 2, h - 8);

  // Constant tax-per-acre diagonals: log(acres) = log(tax) - log(k).
  ctx.strokeStyle = "#ddd";
  ctx.setLineDash([4, 4]);
  for (let ke = 3; ke <= 7; ke++) {
    const k = 10 ** ke;
    ctx.beginPath();
    let labeled = false;
    for (let e = x0 * 10; e <= x1 * 10; e++) {
      const tax = 10 ** (e / 10);
      const ac = tax / k;
      const x = X(tax), y = Y(ac);
      if (y < py || y > py + ph || x < px || x > px + pw) continue;
      if (!labeled) { ctx.moveTo(x, y); labeled = { x, y }; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (labeled) {
      ctx.fillStyle = "#aaa";
      ctx.textAlign = "left";
      ctx.fillText("$" + fmtPow(ke) + "/ac", Math.min(labeled.x + 4, px + pw - 48), Math.max(labeled.y - 6, py + 12));
    }
  }
  ctx.setLineDash([]);

  // Points, indexed into 14px cells for hover lookup.
  grid = new Map();
  const byZone = colorSelect.value === "zoning";
  ctx.fillStyle = "#4a7ab5";
  ctx.globalAlpha = byZone ? 0.55 : 0.45;
  for (const p of points) {
    if (p[0] <= 0) continue;
    const x = X(p[0]), y = Y(p[1]);
    if (byZone) ctx.fillStyle = CAT_COLOR[zoneCategory(p[6])];
    ctx.fillRect(x - 2.25, y - 2.25, 4.5, 4.5);
    const key = ((x / 14) | 0) + ":" + ((y / 14) | 0);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push([x, y, p]);
  }
  ctx.globalAlpha = 1;

  legendEl.style.display = byZone ? "block" : "none";
  if (byZone) {
    legendEl.innerHTML =
      `<div class="legend-title">Zoning</div>` +
      ZONE_CATEGORIES.map(
        (c) => `<div class="legend-row"><span class="swatch" style="background:${c.color}"></span>${c.label}</div>`
      ).join("");
  }
}

function fmtPow(e) {
  return e >= 6 ? 10 ** (e - 6) + "M" : e >= 3 ? 10 ** (e - 3) + "k" : String(10 ** e);
}

function nearest(mx, my) {
  let best = null, bestD = 12 * 12;
  const cx = (mx / 14) | 0, cy = (my / 14) | 0;
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cy - 1; j <= cy + 1; j++)
      for (const [x, y, p] of grid.get(i + ":" + j) || []) {
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
  return best;
}

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  const p = nearest(e.clientX - r.left, e.clientY - r.top);
  if (!p) { tip.style.display = "none"; canvas.style.cursor = ""; return; }
  canvas.style.cursor = "pointer";
  tip.style.display = "block";
  tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 260) + "px";
  tip.style.top = Math.min(e.clientY + 10, window.innerHeight - 170) + "px";
  const [tax, ac, , , apn, address, zone] = p;
  const county = linkCounty();
  const vintage = county.vintage?.tax?.split(" ")[0];
  const zoneCat = ZONE_CATEGORIES.find((c) => c.key === zoneCategory(zone));
  tip.innerHTML =
    `<strong>${address || "(no address)"}</strong><br>` +
    `<span class="muted">APN ${apn}</span><br>` +
    (zone ? `Zoning: ${zone} <span class="muted">(${zoneCat.label})</span><br>` : "") +
    `Annual tax${vintage ? ` <span class="muted">(${vintage})</span>` : ""}: $${tax.toLocaleString()}<br>` +
    `Lot size: ${ac} acres (${Math.round(ac * 43560).toLocaleString()} sq ft)<br>` +
    `<strong>$${Math.round(tax / ac).toLocaleString()}/acre</strong><br>` +
    `<span class="muted">Click for links</span>`;
});
canvas.addEventListener("mouseleave", () => (tip.style.display = "none"));

// Click popup — same content and links as the map view, plus "View on map".
const popupEl = document.getElementById("scatter-popup");

function linkCounty() {
  const county =
    manifest.counties.find((c) => c.id === select.value) ||
    manifest.counties.find((c) => select.value.startsWith(c.id + "-"));
  // City sub-pages embed the city in the address, so links only append ", CA".
  return select.value === county.id ? county : { ...county, city: "CA" };
}

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const p = nearest(e.clientX - r.left, e.clientY - r.top);
  if (!p) { popupEl.style.display = "none"; return; }
  const [tax, ac, lat, lng, apn, address, zone] = p;
  const props = { a: apn, ad: address, t: tax, ac, tpa: Math.round(tax / ac), u: 1, n: zone || undefined };
  popupEl.innerHTML =
    `<button class="info-close" aria-label="Close">&times;</button>` +
    popupHtml(props, linkCounty(), lat, lng) +
    `<div class="popup-links"><a href="../#map=17.5/${lat}/${lng}&sel=${encodeURIComponent(apn)}">View on map</a></div>`;
  popupEl.style.display = "block";
  popupEl.style.left = Math.min(e.clientX + 16, window.innerWidth - 340) + "px";
  popupEl.style.top = Math.min(e.clientY + 8, window.innerHeight - 260) + "px";
  tip.style.display = "none";
});
popupEl.addEventListener("click", (e) => {
  if (e.target.closest(".info-close")) popupEl.style.display = "none";
});

async function load(id) {
  tip.style.display = "none";
  popupEl.style.display = "none";
  const data = await (await fetch(`../data/scatter/${id}.json`)).json();
  points = data.points;
  draw();
}

select.addEventListener("change", () => load(select.value));
colorSelect.addEventListener("change", draw);
window.addEventListener("resize", draw);

const initial = new URLSearchParams(location.search).get("city") || "sf";
select.value = [...select.options].some((o) => o.value === initial) ? initial : options[0].id;
await load(select.value);
