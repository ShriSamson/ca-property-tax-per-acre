// Scatter view: two nested covariance ovals per zoning category (not
// individual dots). X = annual tax (log), Y = lot size (log, inverted so
// small lots are at the top) — high tax/acre = top right. The inner oval
// encloses the central 50% of a category's lots, the outer 90%, so each
// zone type reads as a clean distribution regardless of parcel count.
import { popupHtml } from "./popup.js";

const MARGIN = { top: 24, right: 70, bottom: 46, left: 64 };

const select = document.getElementById("city-select");
const colorSelect = document.getElementById("color-select");
const canvas = document.getElementById("scatter");
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
// pub/other are sparse scatter that muddies the density clouds — default off.
const activeCats = new Set(
  ZONE_CATEGORIES.map((c) => c.key).filter((k) => k !== "pub" && k !== "other")
);

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

const [manifest, scatterIdx] = await Promise.all([
  fetch("../data/counties.json").then((r) => r.json()),
  fetch("../data/scatter/index.json").then((r) => (r.ok ? r.json() : { pages: {} })),
]);
const hasZoning = (id) => scatterIdx.pages?.[id]?.zoning;
const options = [];
for (const c of manifest.counties) {
  options.push({ id: c.id, name: c.name + (c.cities?.length ? " (entire county)" : "") });
  for (const city of c.cities || []) options.push({ id: city.id, name: city.name });
}
options.sort((a, b) => a.name.localeCompare(b.name));
select.innerHTML = options
  .map((o) => `<option value="${o.id}">${o.name}${hasZoning(o.id) ? " (z)" : ""}</option>`)
  .join("");

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
  let tMin = Infinity, tMax = 0;
  for (const p of points) {
    if (p[0] > 0) { if (p[0] < tMin) tMin = p[0]; if (p[0] > tMax) tMax = p[0]; }
  }
  const x0 = Math.floor(log10(Math.max(10, tMin)));
  const x1 = Math.ceil(log10(tMax));
  // Fixed lot-size window: 0.01 acres at the top down to 10 acres.
  const a0 = -2;
  const a1 = 1;
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

  // Density clouds instead of dots. Points are still indexed into 14px
  // cells so hover/click keep resolving to the nearest actual parcel.
  grid = new Map();
  let byZone = colorSelect.value === "zoning";
  // Cities with no zoning data would land every lot in the default-off
  // "other" bucket and render nothing — fall back to one neutral cloud.
  if (byZone) {
    let zoned = 0, n = 0;
    for (const p of points) if (p[0] > 0) { n++; if (p[7] || p[6]) zoned++; }
    if (!n || zoned / n < 0.2) byZone = false;
  }
  const layers = new Map(); // category -> [[x, y], ...]
  for (const p of points) {
    if (p[0] <= 0 || p[1] < 0.01 || p[1] > 10) continue;
    let cat = "all";
    if (byZone) {
      cat = p[7] || zoneCategory(p[6]);
      if (cat === "") cat = "other";
      if (!activeCats.has(cat)) continue;
    }
    const x = X(p[0]), y = Y(p[1]);
    if (!layers.has(cat)) layers.set(cat, []);
    layers.get(cat).push([x, y]);
    const key = ((x / 14) | 0) + ":" + ((y / 14) | 0);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push([x, y, p]);
  }
  // Fit every category's ellipse first, then paint big ovals before small
  // ones — tight distributions (e.g. SF single-family) end up on top
  // instead of buried. Clip so wide ovals stop at the axes.
  const fits = [];
  for (const [cat, pts] of layers) {
    const f = fitOval(pts);
    if (f) fits.push({ ...f, color: byZone ? CAT_COLOR[cat] || CAT_COLOR.other : "#4a7ab5" });
  }
  fits.sort((a, b) => b.area - a.area);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  for (const f of fits) paintOval(f);
  ctx.restore();

  legendEl.style.display = byZone ? "block" : "none";
  if (byZone) {
    legendEl.innerHTML =
      `<div class="legend-title">Zoning density <span class="muted">(click to toggle)</span></div>` +
      ZONE_CATEGORIES.map(
        (c) => `<div class="legend-row legend-toggle${activeCats.has(c.key) ? "" : " off"}" data-cat="${c.key}">
          <span class="swatch" style="background:${c.color}"></span>${c.label}</div>`
      ).join("");
  }
}

// --- Oval rendering: fit a covariance ellipse to the category's points
// (in pixel space, which is affine in log tax × log acres), then fill the
// empirical 50% and 90% regions as flat translucent ovals. Radii come from
// Mahalanobis-distance percentiles, so exactly half the category's lots
// fall inside the inner oval and 90% inside the outer — no Gaussian
// assumption, robust to outliers, coherent at any category size. ---
function fitOval(pts) {
  const n = pts?.length || 0;
  if (n < 5) return null;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx, dy = y - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= n; syy /= n; sxy /= n;
  const half = (sxx + syy) / 2;
  const disc = Math.sqrt(Math.max(0, half * half - (sxx * syy - sxy * sxy)));
  const l1 = Math.sqrt(Math.max(half + disc, 1e-9));
  const l2 = Math.sqrt(Math.max(half - disc, 1e-9));
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const ds = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = pts[i][0] - mx, dy = pts[i][1] - my;
    const a = (dx * cos + dy * sin) / l1;
    const b = (dy * cos - dx * sin) / l2;
    ds[i] = Math.sqrt(a * a + b * b);
  }
  ds.sort();
  const q50 = ds[Math.floor(n * 0.5)];
  const q90 = ds[Math.min(n - 1, Math.floor(n * 0.9))];
  return { mx, my, l1, l2, theta, q50, q90, area: q90 * q90 * l1 * l2 };
}

function paintOval({ mx, my, l1, l2, theta, q50, q90, color }) {
  ctx.fillStyle = color;
  for (const [q, alpha] of [[q90, 0.16], [q50, 0.35]]) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(mx, my, q * l1, q * l2, theta, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

legendEl.addEventListener("click", (e) => {
  const row = e.target.closest(".legend-toggle");
  if (!row) return;
  const cat = row.dataset.cat;
  if (activeCats.has(cat)) activeCats.delete(cat);
  else activeCats.add(cat);
  draw();
});

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

// No hover tooltip: with dots replaced by distribution ovals, surfacing an
// invisible "nearest parcel" on mere hover read as noise.

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
});
popupEl.addEventListener("click", (e) => {
  if (e.target.closest(".info-close")) popupEl.style.display = "none";
});

async function load(id) {
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
