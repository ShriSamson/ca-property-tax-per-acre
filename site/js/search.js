// Minimal address search against Nominatim (search-on-enter, 1 req/s policy).
let lastRequest = 0;

export function initSearch(map, input) {
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    const now = Date.now();
    if (now - lastRequest < 1100) return;
    lastRequest = now;

    const b = map.getBounds();
    const viewbox = [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(",");
    const url =
      "https://nominatim.openstreetmap.org/search?format=geojson&limit=1" +
      `&viewbox=${viewbox}&bounded=0&countrycodes=us&q=${encodeURIComponent(input.value)}`;
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await resp.json();
      const feat = data.features?.[0];
      if (!feat) {
        input.classList.add("search-miss");
        setTimeout(() => input.classList.remove("search-miss"), 800);
        return;
      }
      const [lng, lat] = feat.geometry.coordinates;
      map.flyTo({ center: [lng, lat], zoom: 17 });
    } catch (err) {
      console.warn("geocode failed", err);
    }
  });
}
