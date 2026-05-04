import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const NEIGHBORHOODS = [
  "Upper Valley", "Lower Valley", "Northeast", "East Side",
  "Central El Paso", "Kern Place", "Sunset Heights", "Mission Hills",
  "Coronado", "Cielo Vista", "Eastwood", "El Paso Hills",
  "Five Points", "San Juan", "Smeltertown", "Segundo Barrio",
  "Magoffin", "Chihuahuita", "Downtown", "Rim Road",
  "Westside", "Horizon City", "Socorro", "Ysleta",
  "Fort Bliss", "Castner Heights", "Vinton", "Anthony",
];

const COLORS = [
  "#e63946","#f4a261","#2a9d8f","#457b9d","#6a4c93",
  "#f77f00","#06d6a0","#118ab2","#ef476f","#ffd166",
  "#a8dadc","#c77dff","#80b918","#ff6b6b","#4ecdc4",
];

const EP_CENTER = [31.7619, -106.4850];
const MIN_CONSENSUS = 2;

// ─── Turf helpers ─────────────────────────────────────────────────────────────

function toTurfPolygon(coords) {
  const ring = coords.map(([lat, lng]) => [lng, lat]);
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push(ring[0]);
  }
  return window.turf.polygon([ring]);
}

function computeConsensus(coordsList) {
  if (!window.turf || coordsList.length < MIN_CONSENSUS) return null;
  try {
    let union = toTurfPolygon(coordsList[0]);
    for (let i = 1; i < coordsList.length; i++) {
      const next = toTurfPolygon(coordsList[i]);
      union = window.turf.union(window.turf.featureCollection([union, next]));
    }
    const fromRing = (ring) => ring.map(([lng, lat]) => [lat, lng]);
    const geom = union.geometry;
    if (geom.type === "Polygon") {
      return { type: "Polygon", rings: [fromRing(geom.coordinates[0])] };
    } else if (geom.type === "MultiPolygon") {
      return { type: "MultiPolygon", rings: geom.coordinates.map(poly => fromRing(poly[0])) };
    }
  } catch (e) { /* degenerate polygon */ }
  return null;
}

// ─── GeoJSON export ───────────────────────────────────────────────────────────

function buildGeoJSON(submissions) {
  const byN = {};
  submissions.forEach(s => {
    if (!byN[s.neighborhood]) byN[s.neighborhood] = [];
    byN[s.neighborhood].push(s.coords);
  });

  const features = [];

  Object.entries(byN).forEach(([name, coordsList]) => {
    coordsList.forEach((coords, i) => {
      const ring = coords.map(([lat, lng]) => [lng, lat]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
      features.push({
        type: "Feature",
        properties: { neighborhood: name, type: "submission", index: i, total: coordsList.length },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    });

    if (window.turf && coordsList.length >= MIN_CONSENSUS) {
      const c = computeConsensus(coordsList);
      if (c) {
        const toRing = r => {
          const ring = r.map(([lat, lng]) => [lng, lat]);
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
          return ring;
        };
        features.push({
          type: "Feature",
          properties: { neighborhood: name, type: "consensus", submissionCount: coordsList.length },
          geometry: c.type === "Polygon"
            ? { type: "Polygon", coordinates: [toRing(c.rings[0])] }
            : { type: "MultiPolygon", coordinates: c.rings.map(r => [toRing(r)]) },
        });
      }
    }
  });

  return { type: "FeatureCollection", features };
}

function downloadGeoJSON(submissions) {
  const blob = new Blob([JSON.stringify(buildGeoJSON(submissions), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "elpaso_neighborhoods.geojson";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const drawControlRef = useRef(null);
  const drawnItemsRef = useRef(null);
  const subLayerRef = useRef(null);
  const conLayerRef = useRef(null);
  const activeDrawRef = useRef(null);

  const [submissions, setSubmissions] = useState([]);
  const [selectedN, setSelectedN] = useState("");
  const [phase, setPhase] = useState("select");
  const [mapReady, setMapReady] = useState(false);
  const [turfReady, setTurfReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [viewMode, setViewMode] = useState("both");
  const [sessionSubmitted, setSessionSubmitted] = useState(new Set());
  const [activeTab, setActiveTab] = useState("draw");
  const [exportMsg, setExportMsg] = useState(false);

  // Load stored submissions from localStorage (GitHub Pages has no shared storage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("elpaso_v2");
      if (raw) setSubmissions(JSON.parse(raw));
    } catch (_) {}
  }, []);

  // Load Leaflet + Leaflet.draw + Turf from CDN
  useEffect(() => {
    if (leafletMap.current || !mapRef.current) return;

    const addCSS = (id, href) => {
      if (document.getElementById(id)) return;
      const el = document.createElement("link");
      el.id = id;
      el.rel = "stylesheet";
      el.href = href;
      document.head.appendChild(el);
    };

    const loadScript = (src, ready) => new Promise((res, rej) => {
      if (ready()) return res();
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });

    const loadAll = async () => {
      addCSS("lf-css", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");
      addCSS("lfd-css", "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css");

      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js", () => !!window.L);
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js", () => !!window.L?.Draw);
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js", () => !!window.turf);

      setTurfReady(true);

      const L = window.L;
      const map = L.map(mapRef.current, { center: EP_CENTER, zoom: 12, zoomControl: true });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      drawnItemsRef.current = new L.FeatureGroup().addTo(map);
      subLayerRef.current = new L.FeatureGroup().addTo(map);
      conLayerRef.current = new L.FeatureGroup().addTo(map);

      const drawControl = new L.Control.Draw({
        draw: {
          polygon: {
            allowIntersection: false,
            shapeOptions: { color: "#e63946", weight: 2.5, fillOpacity: 0.12 },
            showArea: false,
            metric: false,
          },
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false,
        },
        edit: { featureGroup: drawnItemsRef.current, edit: false, remove: false },
      });

      map.on(L.Draw.Event.CREATED, e => {
        drawnItemsRef.current.clearLayers();
        drawnItemsRef.current.addLayer(e.layer);
        activeDrawRef.current = null;
        setPhase("done");
      });
      map.on(L.Draw.Event.DRAWSTOP, () => {
        activeDrawRef.current = null;
      });

      drawControlRef.current = drawControl;
      leafletMap.current = map;
      setMapReady(true);
    };

    loadAll().catch(e => setLoadError(e?.message || String(e)));
  }, []);

  // Render map layers
  const renderLayers = useCallback((subs, mode) => {
    const L = window.L;
    if (!L || !subLayerRef.current || !conLayerRef.current) return;
    subLayerRef.current.clearLayers();
    conLayerRef.current.clearLayers();

    const byN = {};
    subs.forEach(s => {
      if (!byN[s.neighborhood]) byN[s.neighborhood] = [];
      byN[s.neighborhood].push(s.coords);
    });

    const showSubs = mode === "both" || mode === "submissions";
    const showCons = mode === "both" || mode === "consensus";

    Object.entries(byN).forEach(([name, list], idx) => {
      const color = COLORS[idx % COLORS.length];
      const count = list.length;

      if (showSubs) {
        list.forEach(coords => {
          L.polygon(coords, {
            color, weight: 1.5, fillColor: color,
            fillOpacity: 0.07, opacity: 0.45, dashArray: "5 5",
          })
            .addTo(subLayerRef.current)
            .bindTooltip(`${name} — individual submission`, { sticky: true });
        });
      }

      if (showCons && count >= MIN_CONSENSUS && window.turf) {
        const c = computeConsensus(list);
        if (c) {
          const opacity = Math.min(0.22 + count * 0.07, 0.62);
          const addPoly = (rings) => {
            L.polygon(rings, {
              color, weight: 3.5, fillColor: color,
              fillOpacity: opacity, opacity: 1,
            })
              .addTo(conLayerRef.current)
              .bindTooltip(
                `${name} — consensus of ${count} submission${count > 1 ? "s" : ""}`,
                { sticky: true }
              );
          };
          if (c.type === "Polygon") addPoly(c.rings[0]);
          else c.rings.forEach(r => addPoly(r));
        }
      }
    });
  }, []);

  useEffect(() => {
    if (mapReady) renderLayers(submissions, viewMode);
  }, [submissions, viewMode, mapReady, turfReady, renderLayers]);

  // Actions
  const startDrawing = () => {
    const L = window.L;
    if (!leafletMap.current || !L) return;
    drawnItemsRef.current?.clearLayers();
    if (!leafletMap.current._dcAdded) {
      leafletMap.current.addControl(drawControlRef.current);
      leafletMap.current._dcAdded = true;
    }
    const draw = new L.Draw.Polygon(
      leafletMap.current,
      drawControlRef.current.options.draw.polygon
    );
    activeDrawRef.current = draw;
    draw.enable();
    setPhase("draw");
  };

  const cancelDrawing = () => {
    activeDrawRef.current?.disable();
    activeDrawRef.current = null;
    drawnItemsRef.current?.clearLayers();
    setPhase("select");
  };

  const submitDrawing = async () => {
    const layers = drawnItemsRef.current?.getLayers();
    if (!layers?.length || !selectedN) return;
    const coords = layers[0].getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    const updated = [...submissions, { neighborhood: selectedN, coords, timestamp: Date.now() }];
    setSubmissions(updated);
    setSessionSubmitted(prev => new Set([...prev, selectedN]));
    setSubmitted(true);
    try {
      localStorage.setItem("elpaso_v2", JSON.stringify(updated));
    } catch (_) {}
    drawnItemsRef.current?.clearLayers();
    setPhase("select");
    setSelectedN("");
    renderLayers(updated, viewMode);
    setTimeout(() => setSubmitted(false), 4500);
  };

  // Derived stats
  const counts = submissions.reduce((a, s) => {
    a[s.neighborhood] = (a[s.neighborhood] || 0) + 1;
    return a;
  }, {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const consensusCount = Object.values(counts).filter(c => c >= MIN_CONSENSUS).length;
  const available = NEIGHBORHOODS.filter(n => !sessionSubmitted.has(n));

  const handleExport = () => {
    downloadGeoJSON(submissions);
    setExportMsg(true);
    setTimeout(() => setExportMsg(false), 3500);
  };

  const colorForN = (name) => {
    const keys = Object.keys(counts);
    const i = keys.indexOf(name);
    return i >= 0 ? COLORS[i % COLORS.length] : "#ccc";
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "#f5f0eb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{
        background: "#1a1a2e", color: "#f5f0eb",
        padding: "15px 26px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "3px solid #e63946", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#777", marginBottom: 3, fontFamily: "monospace" }}>
            Crowdsourced Geography · El Paso, TX
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
            Draw Your Neighborhood
          </h1>
        </div>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <Stat label="Submissions" value={submissions.length} color="#e63946" />
          <Stat label="Neighborhoods" value={Object.keys(counts).length} color="#f4a261" />
          <Stat label="Consensus" value={consensusCount} color="#2a9d8f" />
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{
          width: 292, minWidth: 292, background: "#fff",
          borderRight: "1px solid #e0d8cf", display: "flex",
          flexDirection: "column", overflow: "hidden",
        }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "2px solid #eee", flexShrink: 0 }}>
            {[["draw", "✏️ Contribute"], ["view", "🗺 View & Export"]].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: "11px 4px", border: "none",
                  background: activeTab === tab ? "#fff" : "#f8f5f0",
                  borderBottom: activeTab === tab ? "2px solid #e63946" : "2px solid transparent",
                  marginBottom: -2, fontFamily: "inherit", fontSize: 12.5,
                  fontWeight: activeTab === tab ? 700 : 500,
                  color: activeTab === tab ? "#1a1a2e" : "#888",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Contribute tab ── */}
          {activeTab === "draw" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "13px 17px 9px", borderBottom: "1px solid #f0ece6", fontSize: 12.5, color: "#555", lineHeight: 1.6 }}>
                Select a neighborhood, draw its boundary, and submit. Your drawing joins the community consensus.
              </div>

              {/* Step 1 */}
              <div style={{ padding: "13px 17px", borderBottom: "1px solid #f0ece6" }}>
                <StepLabel n={1} active={phase === "select"} done={!!selectedN}>Choose a neighborhood</StepLabel>
                <select
                  value={selectedN}
                  onChange={e => {
                    setSelectedN(e.target.value);
                    setPhase("select");
                    drawnItemsRef.current?.clearLayers();
                  }}
                  disabled={phase === "draw"}
                  style={{
                    width: "100%", marginTop: 9, padding: "9px 10px",
                    border: "2px solid " + (selectedN ? "#e63946" : "#ddd"),
                    borderRadius: 4, fontSize: 13.5, background: "#fff",
                    cursor: "pointer", fontFamily: "inherit",
                    color: selectedN ? "#1a1a2e" : "#999",
                  }}
                >
                  <option value="">— Select neighborhood —</option>
                  {available.map(n => <option key={n} value={n}>{n}</option>)}
                  {sessionSubmitted.size > 0 && (
                    <optgroup label="Already submitted this session">
                      {[...sessionSubmitted].map(n => (
                        <option key={n} value={n} disabled>{n} ✓</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {sessionSubmitted.size > 0 && (
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 6 }}>
                    {sessionSubmitted.size} neighborhood{sessionSubmitted.size !== 1 ? "s" : ""} submitted this session
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div style={{ padding: "13px 17px", borderBottom: "1px solid #f0ece6" }}>
                <StepLabel n={2} active={!!(selectedN && phase === "select")} done={phase === "done"}>
                  Draw the boundary
                </StepLabel>
                <div style={{ fontSize: 12, color: "#777", margin: "7px 0 10px", lineHeight: 1.5 }}>
                  Click to place vertices on the map. Double-click to close the polygon.
                </div>
                {phase !== "draw" && phase !== "done" && (
                  <Btn enabled={!!selectedN} color="#1a1a2e" onClick={startDrawing}>✏️ Start Drawing</Btn>
                )}
                {phase === "draw" && (
                  <div style={{ background: "#fff8e1", border: "2px solid #ffd166", borderRadius: 4, padding: "10px 12px", fontSize: 12.5, color: "#7a5c00", lineHeight: 1.5 }}>
                    <strong>Drawing active</strong> — click to add points, double-click to finish.
                    <br />
                    <button
                      onClick={cancelDrawing}
                      style={{ marginTop: 7, background: "none", border: "none", color: "#e63946", cursor: "pointer", fontSize: 12, padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {phase === "done" && (
                  <div style={{ fontSize: 12.5, color: "#2a9d8f", background: "#f0faf8", padding: "9px 12px", borderRadius: 4, border: "1px solid #2a9d8f" }}>
                    ✓ Polygon drawn for <strong>{selectedN}</strong>
                    <br />
                    <button
                      onClick={() => { drawnItemsRef.current?.clearLayers(); setPhase("select"); }}
                      style={{ marginTop: 5, background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
                    >
                      Redraw
                    </button>
                  </div>
                )}
              </div>

              {/* Step 3 */}
              <div style={{ padding: "13px 17px", borderBottom: "1px solid #f0ece6" }}>
                <StepLabel n={3} active={phase === "done"} done={submitted}>Submit</StepLabel>
                <div style={{ marginTop: 10 }}>
                  <Btn enabled={phase === "done" && !!selectedN} color="#e63946" onClick={submitDrawing}>
                    Submit My Map →
                  </Btn>
                </div>
                {submitted && (
                  <div style={{ marginTop: 9, fontSize: 12.5, color: "#2a9d8f", textAlign: "center" }}>
                    🎉 Submitted! Your boundary joins the consensus.
                  </div>
                )}
              </div>

              {/* Leaderboard */}
              <div style={{ flex: 1, padding: "13px 17px", overflowY: "auto" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#ccc", marginBottom: 10, fontFamily: "monospace" }}>
                  Most mapped
                </div>
                {top.length === 0
                  ? <div style={{ fontSize: 12, color: "#ccc", fontStyle: "italic" }}>No submissions yet — be the first!</div>
                  : top.map(([name, count], i) => (
                    <div key={name} style={{ marginBottom: 7, display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12.5, color: "#333" }}>{name}</div>
                      {count >= MIN_CONSENSUS && (
                        <span title="Consensus ready" style={{ fontSize: 9, color: "#2a9d8f", fontWeight: 700 }}>●</span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: COLORS[i % COLORS.length], fontFamily: "monospace" }}>
                        {count}
                      </span>
                    </div>
                  ))
                }
                {top.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#ccc" }}>
                    <span style={{ color: "#2a9d8f" }}>●</span> = Turf.js consensus boundary active
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── View & Export tab ── */}
          {activeTab === "view" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "13px 17px 9px", borderBottom: "1px solid #f0ece6", fontSize: 12.5, color: "#555", lineHeight: 1.6 }}>
                Control which layers appear on the map and export the data for use in GIS tools.
              </div>

              {/* Layer control */}
              <div style={{ padding: "13px 17px", borderBottom: "1px solid #f0ece6" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#ccc", marginBottom: 12, fontFamily: "monospace" }}>
                  Map layers
                </div>
                {[
                  ["both", "All layers", "Submissions + Turf.js consensus"],
                  ["consensus", "Consensus only", `Union of ${MIN_CONSENSUS}+ submissions per neighborhood`],
                  ["submissions", "Submissions only", "Raw individual drawn polygons"],
                  ["none", "Hide all", "Clear the map display"],
                ].map(([val, label, desc]) => (
                  <label key={val} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="vm"
                      value={val}
                      checked={viewMode === val}
                      onChange={() => setViewMode(val)}
                      style={{ accentColor: "#e63946", marginTop: 2, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{label}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* GeoJSON export */}
              <div style={{ padding: "13px 17px", borderBottom: "1px solid #f0ece6" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#ccc", marginBottom: 12, fontFamily: "monospace" }}>
                  Export
                </div>
                <Btn enabled={submissions.length > 0} color="#2a9d8f" onClick={handleExport}>
                  ⬇ Download GeoJSON
                </Btn>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 9, lineHeight: 1.55 }}>
                  Exports all individual polygons plus Turf.js consensus boundaries as a GeoJSON FeatureCollection. Compatible with QGIS, Mapbox, ArcGIS, and any GIS tool.
                </div>
                {exportMsg && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#2a9d8f" }}>
                    ✓ Saved as elpaso_neighborhoods.geojson
                  </div>
                )}
              </div>

              {/* Full neighborhood status */}
              <div style={{ flex: 1, padding: "13px 17px", overflowY: "auto" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#ccc", marginBottom: 10, fontFamily: "monospace" }}>
                  All neighborhoods
                </div>
                {NEIGHBORHOODS.map(name => {
                  const count = counts[name] || 0;
                  const hasC = count >= MIN_CONSENSUS;
                  return (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, opacity: count === 0 ? 0.35 : 1 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: count > 0 ? colorForN(name) : "#ddd", flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12.5, color: "#333" }}>{name}</div>
                      {count > 0 && (
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#bbb" }}>{count}</span>
                      )}
                      {hasC && (
                        <span style={{ fontSize: 9, background: "#2a9d8f", color: "#fff", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                          consensus
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ padding: "10px 17px", borderTop: "1px solid #eee", fontSize: 10.5, color: "#ccc", lineHeight: 1.5, flexShrink: 0 }}>
            Submissions stored locally. Consensus computed via Turf.js polygon union.
          </div>
        </div>

        {/* Map */}
        <div style={{ flex: 1, position: "relative" }}>
          {loadError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0eb", zIndex: 10, flexDirection: "column", gap: 8 }}>
              <div style={{ color: "#e63946", fontSize: 14 }}>⚠ Map failed to load</div>
              <div style={{ fontSize: 12, color: "#999" }}>{loadError}</div>
            </div>
          )}
          {!mapReady && !loadError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0ece6", zIndex: 10, flexDirection: "column", gap: 14 }}>
              <div style={{ width: 34, height: 34, border: "3px solid #e63946", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
              <div style={{ fontSize: 14, color: "#888" }}>Loading map &amp; Turf.js…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: "500px" }} />

          {/* Drawing pill */}
          {phase === "draw" && (
            <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", color: "#fff", padding: "8px 20px", borderRadius: 24, fontSize: 13, zIndex: 1000, pointerEvents: "none", boxShadow: "0 3px 14px rgba(0,0,0,0.35)" }}>
              ✏️ Click to place points · Double-click to finish
            </div>
          )}

          {/* Active neighborhood chip */}
          {selectedN && activeTab === "draw" && (
            <div style={{ position: "absolute", bottom: 28, right: 14, background: "#e63946", color: "#fff", padding: "8px 16px", borderRadius: 4, fontSize: 13.5, fontWeight: 700, zIndex: 999, boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }}>
              📍 {selectedN}
            </div>
          )}

          {/* View mode badge */}
          {activeTab === "view" && viewMode !== "none" && (
            <div style={{ position: "absolute", top: 14, right: 14, background: "#1a1a2e", color: "#f5f0eb", padding: "6px 14px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", zIndex: 999, boxShadow: "0 2px 8px rgba(0,0,0,0.2)", letterSpacing: "0.06em" }}>
              {viewMode === "both" ? "ALL LAYERS" : viewMode === "consensus" ? "CONSENSUS ONLY" : "SUBMISSIONS ONLY"}
            </div>
          )}

          {/* Legend */}
          {viewMode !== "none" && submissions.length > 0 && (
            <div style={{ position: "absolute", bottom: 28, left: 14, background: "rgba(255,255,255,0.94)", border: "1px solid #eee", borderRadius: 6, padding: "10px 14px", zIndex: 999, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", fontSize: 11.5 }}>
              {(viewMode === "both" || viewMode === "submissions") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <svg width="24" height="10">
                    <line x1="0" y1="5" x2="24" y2="5" stroke="#999" strokeWidth="1.5" strokeDasharray="5 4" />
                  </svg>
                  <span style={{ color: "#555" }}>Individual submissions</span>
                </div>
              )}
              {(viewMode === "both" || viewMode === "consensus") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="24" height="10">
                    <line x1="0" y1="5" x2="24" y2="5" stroke="#e63946" strokeWidth="3.5" />
                  </svg>
                  <span style={{ color: "#555" }}>Turf.js consensus boundary</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function StepLabel({ n, active, done, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
      <div style={{
        width: 21, height: 21, borderRadius: "50%",
        background: done ? "#2a9d8f" : active ? "#e63946" : "#ddd",
        color: "#fff", fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, transition: "background 0.25s", fontFamily: "monospace",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{
        fontSize: 12.5, fontWeight: 600,
        color: (active || done) ? "#1a1a2e" : "#aaa",
        textTransform: "uppercase", letterSpacing: "0.06em",
        transition: "color 0.25s",
      }}>
        {children}
      </span>
    </div>
  );
}

function Btn({ enabled, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      style={{
        width: "100%", padding: "10px 12px",
        background: enabled ? color : "#d5d5d5",
        color: "#fff", border: "none", borderRadius: 4,
        fontSize: 13.5, cursor: enabled ? "pointer" : "not-allowed",
        fontFamily: "inherit", fontWeight: 600,
        transition: "background 0.2s, opacity 0.2s",
        opacity: enabled ? 1 : 0.65,
      }}
    >
      {children}
    </button>
  );
}
