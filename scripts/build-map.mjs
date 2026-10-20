// Builds lib/map-data.json (SVG paths of oblasts and raions) from GeoJSON.
// Data: https://github.com/slawomirmatuszak/ukrainian_geodata (CC BY 4.0), 136 raions after the 2020 reform.
// Run: node scripts/build-map.mjs
import { writeFileSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/main/";
const WIDTH = 1000;
const PAD = 10;
const TOLERANCE = 0.5; // simplification, in map units

// Short labels like in the Air Alert app; the key is the oblast name in the alerts APIs
const LABELS = {
  "Автономна Республіка Крим": "А. Р. Крим",
  "м. Київ": "м. Київ",
  "м. Севастополь": "", // too small for a label
};
// Labels that land on top of something else
const LABEL_SHIFT = { "Київська область": [-10, 40], "м. Київ": [0, -8] };

const load = async (file) => (await (await fetch(BASE + file)).json()).features;
const [rawOblasts, rawRaions] = await Promise.all([load("regiony.geojson"), load("rayony.geojson")]);

const polygons = (g) => (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]);

// Equirectangular projection, x scaled by cos of the middle latitude
const all = rawOblasts.flatMap((f) => polygons(f.geometry).flat(2));
const minLon = Math.min(...all.map((p) => p[0])), maxLon = Math.max(...all.map((p) => p[0]));
const minLat = Math.min(...all.map((p) => p[1])), maxLat = Math.max(...all.map((p) => p[1]));
const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
const scale = (WIDTH - 2 * PAD) / ((maxLon - minLon) * kx);
const HEIGHT = Math.ceil((maxLat - minLat) * scale + 2 * PAD);
const project = ([lon, lat]) => [PAD + (lon - minLon) * kx * scale, PAD + (maxLat - lat) * scale];

function simplify(pts) {
  // Douglas-Peucker
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / len;
      if (d > max) (max = d), (idx = i);
    }
    if (max > TOLERANCE) (keep[idx] = 1), stack.push([a, idx], [idx, b]);
  }
  return pts.filter((_, i) => keep[i]);
}

const ringPath = (ring) => {
  // GeoJSON rings repeat the first point at the end; Douglas-Peucker needs distinct ends
  const pts = simplify(ring.slice(0, -1).map(project));
  return pts.length < 3 ? "" : "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
};
const toPath = (polys) => polys.map((poly) => poly.map(ringPath).join("")).join("");

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[j];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
const inPolys = (p, polys) => polys.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));

const area = (ring) => Math.abs(ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + x1 * y2 - x2 * y1;
}, 0)) / 2;

// A point inside the shape near its centroid: for labels, icons and oblast lookup
function anchor(polys) {
  const ring = polys.map((p) => p[0]).sort((a, b) => area(b) - area(a))[0];
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  if (inPolys([cx, cy], polys)) return [cx, cy];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  let best = null, bestD = Infinity;
  for (let i = 1; i < 30; i++) {
    for (let j = 1; j < 30; j++) {
      const p = [Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 30, Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 30];
      const d = Math.hypot(p[0] - cx, p[1] - cy);
      if (d < bestD && inPolys(p, polys)) (best = p), (bestD = d);
    }
  }
  return best;
}

const round = ([x, y]) => [Math.round(x), Math.round(y)];

const oblasts = rawOblasts.map((f) => ({
  id: f.properties.region === "Севастополь" ? "м. Севастополь" : f.properties.region,
  polys: polygons(f.geometry),
}));

// Kyiv city is the hole in Kyiv oblast
const kyivOblast = oblasts.find((o) => o.id === "Київська область");
const kyivCity = [[kyivOblast.polys.find((p) => p.length > 1)[1]]];
oblasts.push({ id: "м. Київ", polys: kyivCity });

const oblastsOut = oblasts.map(({ id, polys }) => {
  const [x, y] = project(anchor(polys));
  const [dx, dy] = LABEL_SHIFT[id] ?? [0, 0];
  return { id, label: LABELS[id] ?? id.replace(" область", ""), d: toPath(polys), x: Math.round(x + dx), y: Math.round(y + dy) };
});

const raionsOut = rawRaions.map((f) => {
  const polys = polygons(f.geometry);
  const point = anchor(polys);
  const oblast = oblasts.find((o) => o.id !== "м. Київ" && inPolys(point, o.polys));
  if (!oblast) throw new Error("No oblast for " + f.properties.rayon);
  return { id: f.properties.rayon, oblast: oblast.id, d: toPath(polys), ...Object.fromEntries(["x", "y"].map((k, i) => [k, round(project(point))[i]])) };
});
// The cities are fill units too: they are not part of any raion
for (const id of ["м. Київ", "м. Севастополь"]) {
  const o = oblastsOut.find((o) => o.id === id);
  raionsOut.push({ id, oblast: id, d: o.d, x: o.x, y: o.y });
}

const data = { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, oblasts: oblastsOut, raions: raionsOut };
writeFileSync(new URL("../lib/map-data.json", import.meta.url), JSON.stringify(data));

const count = {};
for (const r of raionsOut) count[r.oblast] = (count[r.oblast] ?? 0) + 1;
console.log(data.viewBox, `${oblastsOut.length} oblasts, ${raionsOut.length} raions`, count);
