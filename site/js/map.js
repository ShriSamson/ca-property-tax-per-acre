import { fillColorExpression, extrusionHeightExpression, buildLegend } from "./colors.js";
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
if (counties.length > 1) {
  // Fit all covered areas on first load.
  const lngs = counties.map((c) => c.center[0]);
  const lats = counties.map((c) => c.center[1]);
  start = {
    bounds: [
      [Math.min(...lngs) - 0.18, Math.min(...lats) - 0.12],
      [Math.max(...lngs) + 0.18, Math.max(...lats) + 0.12],
    ],
  };
}
if (hash.map) {
  const [z, lat, lng] = hash.map.split("/").map(Number);
  if ([z, lat, lng].every(Number.isFinite)) start = { center: [lng, lat], zoom: z };
}

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  ...start,
  maxZoom: 20,
  maxPitch: 85,
});
// visualizePitch makes the compass tilt with the camera; dragging it rotates,
// clicking it resets bearing and pitch. Ctrl+drag / right-click-drag rotate
// and tilt freely (MapLibre default), like Google Maps.
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

class PitchControl {
  onAdd(map) {
    const div = document.createElement("div");
    div.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const mk = (label, title, delta) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = title;
      b.innerHTML = `<span class="pitch-btn">${label}</span>`;
      b.addEventListener("click", () =>
        map.easeTo({ pitch: Math.min(85, Math.max(0, map.getPitch() + delta)) })
      );
      div.appendChild(b);
    };
    mk("▲", "Tilt view (more 3D)", +15);
    mk("▼", "Flatten view (top-down)", -15);
    this._div = div;
    return div;
  }
  onRemove() {
    this._div.remove();
  }
}
map.addControl(new PitchControl(), "top-right");
map.on("error", (e) => console.error("map error:", e.error?.message || e));
window._map = map;

const fillOpacity = (sat) => [
  "case",
  ["boolean", ["feature-state", "selected"], false], 0.95,
  ["boolean", ["feature-state", "hover"], false], 0.85,
  sat ? 0.35 : 0.6,
];

map.on("load", () => {
  // Keep basemap labels above the parcel layers.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

  // Optional satellite imagery, under the parcel layers.
  map.addSource("satellite", {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  });
  map.addLayer(
    { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
    firstSymbol
  );

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
        "fill-opacity": fillOpacity(false),
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
    map.addLayer({
      id: `${srcId}-3d`,
      type: "fill-extrusion",
      source: srcId,
      "source-layer": "parcels",
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": fillColorExpression(),
        "fill-extrusion-height": extrusionHeightExpression(),
        "fill-extrusion-opacity": 0.9,
      },
    }, firstSymbol);

    let hoverId = null;
    for (const layerId of [`${srcId}-fill`, `${srcId}-3d`]) {
      map.on("mousemove", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";
        if (hoverId !== null)
          map.setFeatureState({ source: srcId, sourceLayer: "parcels", id: hoverId }, { hover: false });
        hoverId = e.features[0].id;
        map.setFeatureState({ source: srcId, sourceLayer: "parcels", id: hoverId }, { hover: true });
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        if (hoverId !== null)
          map.setFeatureState({ source: srcId, sourceLayer: "parcels", id: hoverId }, { hover: false });
        hoverId = null;
      });
      map.on("click", layerId, (e) => {
        const f = e.features[0];
        selectParcel(srcId, f.id);
        new maplibregl.Popup({ maxWidth: "320px" })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(f.properties, county, e.lngLat.lat.toFixed(6), e.lngLat.lng.toFixed(6)))
          .addTo(map);
      });
    }
  }

  const btnSat = document.getElementById("toggleSat");
  let isSat = false;
  btnSat.addEventListener("click", () => {
    isSat = !isSat;
    btnSat.classList.toggle("active", isSat);
    map.setLayoutProperty("satellite", "visibility", isSat ? "visible" : "none");
    for (const county of counties) {
      const srcId = `parcels-${county.id}`;
      // Thin the tint over imagery so building footprints stay readable.
      map.setPaintProperty(`${srcId}-fill`, "fill-opacity", fillOpacity(isSat));
      map.setPaintProperty(`${srcId}-3d`, "fill-extrusion-opacity", isSat ? 0.55 : 0.9);
    }
  });

  const btn3d = document.getElementById("toggle3d");
  let is3d = false;
  btn3d.addEventListener("click", () => {
    is3d = !is3d;
    btn3d.classList.toggle("active", is3d);
    for (const county of counties) {
      const srcId = `parcels-${county.id}`;
      map.setLayoutProperty(`${srcId}-fill`, "visibility", is3d ? "none" : "visible");
      map.setLayoutProperty(`${srcId}-line`, "visibility", is3d ? "none" : "visible");
      map.setLayoutProperty(`${srcId}-3d`, "visibility", is3d ? "visible" : "none");
    }
    document.getElementById("hint3d").style.display = is3d ? "block" : "none";
    map.easeTo({ pitch: is3d ? 55 : 0, bearing: is3d ? map.getBearing() : 0, duration: 800 });
  });

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

// Maps initialized in a hidden/background tab miss their initial sizing
// (rAF and ResizeObserver are throttled) — force a resize once visible.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) map.resize();
});
window.addEventListener("pageshow", () => map.resize());
map.once("idle", () => map.resize());

map.on("moveend", () => {
  const c = map.getCenter();
  const z = map.getZoom().toFixed(2);
  history.replaceState(null, "", `#map=${z}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`);
});

buildLegend(document.getElementById("legend"));
initSearch(map, document.getElementById("search"));

// Coverage footer line with per-city tax vintages.
const totalTaxed = counties.reduce((s, c) => s + c.stats.with_tax, 0);
document.getElementById("data-note").textContent =
  `${counties.map((c) => `${c.name} (${c.vintage.tax})`).join(" · ")} — ` +
  `${totalTaxed.toLocaleString()} taxed parcels`;
