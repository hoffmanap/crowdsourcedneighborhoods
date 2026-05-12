# Draw Your El Paso Neighborhood

A crowdsourced mapping tool where users draw polygon boundaries for El Paso neighborhoods. Submissions are stored locally and overlaid on the map. As more users contribute, Turf.js computes true consensus boundaries from the union of all submitted polygons.

Try it at: https://hoffmanap.github.io/crowdsourcedneighborhoods/

## Features

- **Draw polygons** on a Leaflet map to define neighborhood extents
- **Turf.js consensus** — polygon union of all submissions per neighborhood
- **Per-session submission limit** — one drawing per neighborhood per visit
- **View & Export tab** — toggle layers, download GeoJSON for use in QGIS / Mapbox / ArcGIS

---

## Tech stack

| Library | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| Vite | 5 | Build tool |
| Leaflet | 1.9.4 | Interactive map |
| Leaflet.draw | 1.0.4 | Polygon drawing tool |
| Turf.js | 6.5.0 | Polygon union / consensus geometry |
| gh-pages | 6 | GitHub Pages deployment |
