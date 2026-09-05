// Single source of truth for the tax-per-acre color scale.
// 10 discrete buckets of increasing darkness (single-hue blues) so
// neighborhood-level differences read boldly at a glance.
export const NO_DATA_COLOR = "#d4d4d0";
export const ZERO_TAX_COLOR = "#9b8ec4";

// Two clean families with no muddy transition: the bottom five buckets run
// light → dark blue, the top five jump to light → saturated golden yellow.
export const BUCKETS = [
  { min: 0,         color: "#e3f2fb", label: "< $10k" },
  { min: 10_000,    color: "#b8d9f0", label: "$10k – 25k" },
  { min: 25_000,    color: "#8bbfe3", label: "$25k – 50k" },
  { min: 50_000,    color: "#5a9fd2", label: "$50k – 100k" },
  { min: 100_000,   color: "#2b7bba", label: "$100k – 200k" },
  { min: 200_000,   color: "#fff3c4", label: "$200k – 400k" },
  { min: 400_000,   color: "#ffe58f", label: "$400k – 800k" },
  { min: 800_000,   color: "#ffd545", label: "$800k – 1.6M" },
  { min: 1_600_000, color: "#ffc107", label: "$1.6M – 3M" },
  { min: 3_000_000, color: "#f59f00", label: "$3M+" },
];

// MapLibre paint expression: gray for no data, tan for $0 (exempt),
// stepped bucket colors otherwise.
export function fillColorExpression() {
  const step = ["step", ["get", "tpa"], BUCKETS[0].color];
  for (const b of BUCKETS.slice(1)) step.push(b.min, b.color);
  return [
    "case",
    ["!", ["has", "tpa"]], NO_DATA_COLOR,
    ["==", ["get", "t"], 0], ZERO_TAX_COLOR,
    step,
  ];
}

// 3D bar height: pure linear — 10x the tax/acre is exactly 10x the height.
// 120m per $1M/acre: bottom bucket (<$10k) is ~1m (flat), median ~15m,
// $1M/acre = 120m, $10M = 1200m, the $39M/acre peak = ~4700m.
export function extrusionHeightExpression() {
  return [
    "case",
    ["!", ["has", "tpa"]], 0,
    ["*", 0.00012, ["max", ["get", "tpa"], 0]],
  ];
}

// Plain-JS bucket lookup (canvas rendering can't use MapLibre expressions).
export function bucketColor(tpa) {
  let color = BUCKETS[0].color;
  for (const b of BUCKETS) if (tpa >= b.min) color = b.color;
  return color;
}

export function buildLegend(container) {
  const rows = BUCKETS.map(
    (b) => `<div class="legend-row"><span class="swatch" style="background:${b.color}"></span>${b.label}</div>`
  ).join("");
  container.innerHTML = `
    <div class="legend-title">Tax revenue per acre</div>
    <div class="legend-grid">${rows}</div>
    <div class="legend-row"><span class="swatch" style="background:${ZERO_TAX_COLOR}"></span>$0 (exempt)</div>
    <div class="legend-row"><span class="swatch" style="background:${NO_DATA_COLOR}"></span>No tax data</div>`;
}
