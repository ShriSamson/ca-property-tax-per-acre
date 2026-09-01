import { fillColorExpression, buildLegend } from "./colors.js";
import { popupHtml } from "./popup.js";
import { initSearch } from "./search.js";

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const manifest = await (await fetch("data/counties.json")).json();
const counties = manifest.counties;

// Deep link: #map=zoom/lat/lng&sel=apn
function parseHash() {
  const h = {};
  for (const part of location.hash.slice(1).split("&")) {
    const [k, v] = part.split("=");
    if (k) h[k] = v;
  }
  return h;
}
const hash = parseHash();
let start = { center: counties[0].center, zoom: counties[0].zoom };
if (hash.map) {
  const [z, lat, lng] = hash.map.split("/").map(Number);
  if ([z, lat, lng].every(Number.isFinite)) start = { center: [lng, lat], zoom: z };
}

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  ...start,
  maxZoom: 20,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.on("error", (e) => console.error("map error:", e.error?.message || e));
window._map = map;

map.on("load", () => {
  // Keep basemap labels above the parcel layers.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  for (const county of counties) {
    const srcId = `parcels-${county.id}`;
    map.addSource(srcId, {
      type: "vector",
      url: `pmtiles://${new URL(county.tiles, location.href).href}`,
      promoteId: "a",
    });
    map.addLayer({
      id: `${srcId}-fill`,
      type: "fill",
      source: srcId,
      "source-layer": "parcels",
      paint: {
        "fill-color": fillColorExpression(),
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false], 0.95,
          ["boolean", ["feature-state", "hover"], false], 0.85,
          0.6,
        ],
      },
    }, firstSymbol);
    map.addLayer({
      id: `${srcId}-line`,
      type: "line",
      source: srcId,
      "source-layer": "parcels",
      minzoom: 14,
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false], "#000",
          "#666",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false], 2.5,
          0.5,
        ],
        "line-opacity": 0.5,
      },
    }, firstSymbol);

    let hoverId = null;
    map.on("mousemove", `${srcId}-fill`, (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (hoverId !== null)
        map.setFeatureState({ source: srcId, sourceLayer: "parcels", id: hoverId }, { hover: false });
      hoverId = e.features[0].id;
      map.setFeatureState({ source: srcId, sourceLayer: "parcels", id: hoverId }, { hover: true });
    });
    map.on("mouseleave", `${srcId}-fill`, () => {
      map.getCanvas().style.cursor = "";
      if (hoverId !== null)
        map.setFeatureState({ source: srcId, sourceLayer: "parcels", id: hoverId }, { hover: false });
      hoverId = null;
    });
    map.on("click", `${srcId}-fill`, (e) => {
      const f = e.features[0];
      selectParcel(srcId, f.id);
      new maplibregl.Popup({ maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(f.properties, county, e.lngLat.lat.toFixed(6), e.lngLat.lng.toFixed(6)))
        .addTo(map);
    });
  }

  // Deep-linked parcel selection from highlights pages.
  if (hash.sel) {
    const trySelect = () => {
      for (const county of counties) {
        const srcId = `parcels-${county.id}`;
        const feats = map.querySourceFeatures(srcId, { sourceLayer: "parcels" });
        const f = feats.find((f) => f.id === hash.sel);
        if (f) {
          selectParcel(srcId, f.id);
          const p = f.properties;
          const [lng, lat] = start.center;
          new maplibregl.Popup({ maxWidth: "320px" })
            .setLngLat([lng, lat])
            .setHTML(popupHtml(p, county, lat.toFixed(6), lng.toFixed(6)))
            .addTo(map);
          return true;
        }
      }
      return false;
    };
    map.once("idle", trySelect);
  }
});

let selected = null;
function selectParcel(srcId, id) {
  if (selected)
    map.setFeatureState(
      { source: selected.srcId, sourceLayer: "parcels", id: selected.id },
      { selected: false }
    );
  selected = { srcId, id };
  map.setFeatureState({ source: srcId, sourceLayer: "parcels", id }, { selected: true });
}

map.on("moveend", () => {
  const c = map.getCenter();
  const z = map.getZoom().toFixed(2);
  history.replaceState(null, "", `#map=${z}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`);
});

buildLegend(document.getElementById("legend"));
initSearch(map, document.getElementById("search"));

// County stats footer line.
const s = counties[0].stats;
document.getElementById("data-note").textContent =
  `${counties[0].name}: ${s.with_tax.toLocaleString()} taxed parcels · ` +
  `tax roll ${counties[0].vintage.tax} · parcel map ${counties[0].vintage.parcels}`;
