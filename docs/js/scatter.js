// Scatter view: a translucent density cloud per zoning category (not
// individual dots). X = annual tax (log), Y = lot size (log, inverted so
// small lots are at the top) — high tax/acre = top right. Each category is
// binned, blurred, and normalized to its own peak, so opacity shows where
// that zone type's distribution sits regardless of how many parcels it has.
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
  // Listed order: big residential clouds first, rarer categories composited
  // on top so they stay visible.
  const order = byZone
    ? ZONE_CATEGORIES.map((c) => c.key).filter((k) => layers.has(k))
    : [...layers.keys()];
  for (const cat of order)
    drawDensity(layers.get(cat), byZone ? CAT_COLOR[cat] || CAT_COLOR.other : "#4a7ab5");

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

// --- Density rendering: bin → box-blur (≈Gaussian) → normalize → tint. ---
const CELL = 3; // density grid resolution in CSS px

function boxBlur(d, cw, ch, r) {
  const tmp = new Float32Array(d.length);
  for (let j = 0; j < ch; j++) {
    const off = j * cw;
    let acc = 0;
    for (let i = 0; i <= Math.min(r, cw - 1); i++) acc += d[off + i];
    for (let i = 0; i < cw; i++) {
      tmp[off + i] = acc;
      if (i + r + 1 < cw) acc += d[off + i + r + 1];
      if (i - r >= 0) acc -= d[off + i - r];
    }
  }
  for (let i = 0; i < cw; i++) {
    let acc = 0;
    for (let j = 0; j <= Math.min(r, ch - 1); j++) acc += tmp[j * cw + i];
    for (let j = 0; j < ch; j++) {
      d[j * cw + i] = acc;
      if (j + r + 1 < ch) acc += tmp[(j + r + 1) * cw + i];
      if (j - r >= 0) acc -= tmp[(j - r) * cw + i];
    }
  }
}

function drawDensity(pts, color) {
  if (!pts?.length || !view) return;
  const { px, py, pw, ph } = view;
  const cw = Math.max(1, Math.ceil(pw / CELL));
  const ch = Math.max(1, Math.ceil(ph / CELL));
  const d = new Float32Array(cw * ch);
  for (const [x, y] of pts) {
    const i = Math.min(cw - 1, Math.max(0, ((x - px) / CELL) | 0));
    const j = Math.min(ch - 1, Math.max(0, ((y - py) / CELL) | 0));
    d[j * cw + i]++;
  }
  // Triple box blur ≈ Gaussian, σ ≈ 12px: smooth enough that each mass
  // band forms a few large contours instead of confetti islands.
  boxBlur(d, cw, ch, 4);
  boxBlur(d, cw, ch, 4);
  boxBlur(d, cw, ch, 4);
  // Opacity encodes probability mass, not raw density: find the density
  // levels enclosing the top 50% and 90% of this category's parcels
  // (highest-density-region bands). Scale-free, so a 70k-lot category and a
  // 300-lot category both read as coherent 50/90% regions.
  let total = 0;
  for (let k = 0; k < d.length; k++) total += d[k];
  if (!total) return;
  const sorted = Float64Array.from(d).sort().reverse();
  let acc = 0, t50 = 0, t90 = 0;
  for (const v of sorted) {
    acc += v;
    if (!t50 && acc >= total * 0.5) t50 = v;
    if (acc >= total * 0.9) { t90 = v; break; }
  }
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const img = new ImageData(cw, ch);
  for (let k = 0; k < d.length; k++) {
    const v = d[k];
    if (!v) continue;
    // Contour-style: strong ring at the 50%-mass boundary, lighter ring at
    // 90%, faint fills between — overlapping categories stay tellable apart.
    // Interior fills stay near-transparent so four overlapping categories
    // don't composite into mud; the rings carry the hue.
    let a;
    if (v >= t50 * 1.25) a = 0.14;
    else if (v >= t50) a = 0.72;
    else if (v >= t90 * 1.2) a = 0.07;
    else if (v >= t90) a = 0.42;
    else a = 0.04 * (v / (t90 || 1)) ** 0.7;
    img.data[k * 4] = r;
    img.data[k * 4 + 1] = g;
    img.data[k * 4 + 2] = b;
    img.data[k * 4 + 3] = Math.round(255 * a);
  }
  const off = document.createElement("canvas");
  off.width = cw;
  off.height = ch;
  off.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, px, py, pw, ph);
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
  const catKey = p[7] || zoneCategory(zone);
  const zoneCat = ZONE_CATEGORIES.find((c) => c.key === catKey) || ZONE_CATEGORIES.at(-1);
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
