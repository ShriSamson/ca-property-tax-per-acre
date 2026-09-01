// Single source of truth for the tax-per-acre color scale.
// Breaks are log10(tax per acre): 10^3 = $1k/acre ... 10^7 = $10M/acre.
export const NO_DATA_COLOR = "#d4d4d0";
export const ZERO_TAX_COLOR = "#c9a96b";

// Single-hue sequential ramp: light blue → dark navy, darkness increasing
// monotonically with tax per acre (ColorBrewer Blues).
export const RAMP = [
  { log: 3, color: "#eff6fc", label: "$1k" },
  { log: 4, color: "#c6dbef", label: "$10k" },
  { log: 4.7, color: "#9ecae1", label: "$50k" },
  { log: 5.3, color: "#6baed6", label: "$200k" },
  { log: 6, color: "#2b7bba", label: "$1M" },
  { log: 7, color: "#08306b", label: "$10M+" },
];

// MapLibre paint expression: gray for no data, purple for $0 (exempt),
// log-interpolated ramp otherwise.
export function fillColorExpression() {
  const stops = RAMP.flatMap((s) => [s.log, s.color]);
  return [
    "case",
    ["!", ["has", "tpa"]], NO_DATA_COLOR,
    ["==", ["get", "t"], 0], ZERO_TAX_COLOR,
    ["interpolate", ["linear"], ["log10", ["max", ["get", "tpa"], 1]], ...stops],
  ];
}

export function buildLegend(container) {
  const gradient = RAMP.map(
    (s) => `${s.color} ${((s.log - RAMP[0].log) / (RAMP.at(-1).log - RAMP[0].log)) * 100}%`
  ).join(", ");
  container.innerHTML = `
    <div class="legend-title">Tax revenue per acre</div>
    <div class="legend-bar" style="background: linear-gradient(to right, ${gradient})"></div>
    <div class="legend-labels">${RAMP.map((s) => `<span>${s.label}</span>`).join("")}</div>
    <div class="legend-row"><span class="swatch" style="background:${ZERO_TAX_COLOR}"></span>$0 (exempt)</div>
    <div class="legend-row"><span class="swatch" style="background:${NO_DATA_COLOR}"></span>No tax data</div>`;
}
