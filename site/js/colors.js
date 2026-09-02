// Single source of truth for the tax-per-acre color scale.
// 10 discrete buckets of increasing darkness (single-hue blues) so
// neighborhood-level differences read boldly at a glance.
export const NO_DATA_COLOR = "#d4d4d0";
export const ZERO_TAX_COLOR = "#c9a96b";

export const BUCKETS = [
  { min: 0,         color: "#f7fbff", label: "< $10k" },
  { min: 10_000,    color: "#deebf7", label: "$10k – 25k" },
  { min: 25_000,    color: "#c6dbef", label: "$25k – 50k" },
  { min: 50_000,    color: "#9ecae1", label: "$50k – 100k" },
  { min: 100_000,   color: "#6baed6", label: "$100k – 200k" },
  { min: 200_000,   color: "#4292c6", label: "$200k – 400k" },
  { min: 400_000,   color: "#2171b5", label: "$400k – 800k" },
  { min: 800_000,   color: "#08519c", label: "$800k – 1.6M" },
  { min: 1_600_000, color: "#08306b", label: "$1.6M – 3M" },
  { min: 3_000_000, color: "#041d42", label: "$3M+" },
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
// 40m per $1M/acre: bottom bucket (<$10k) is <0.4m (flat), median ~5m,
// $1M/acre = 40m, $10M = 400m, the $39M/acre peak = ~1560m.
export function extrusionHeightExpression() {
  return [
    "case",
    ["!", ["has", "tpa"]], 0,
    ["*", 0.00004, ["max", ["get", "tpa"], 0]],
  ];
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
