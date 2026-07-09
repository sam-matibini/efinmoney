import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const landPath = join(root, "public", "geo", "ne_110m_land.json");
const outPath = join(root, "public", "geo", "ne_110m_land_dots_compact.json");

const pointInPolygon = (point, polygon) => {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const pointInFeature = (point, feature) => {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates;
    if (!pointInPolygon(point, coordinates[0])) return false;
    for (let i = 1; i < coordinates.length; i++) {
      if (pointInPolygon(point, coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      if (pointInPolygon(point, polygon[0])) {
        for (let i = 1; i < polygon.length; i++) {
          if (pointInPolygon(point, polygon[i])) return false;
        }
        return true;
      }
    }
  }
  return false;
};

const boundsOf = (feature) => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const walk = (coords) => {
    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  };
  const geom = feature.geometry;
  if (geom.type === "Polygon") geom.coordinates.forEach(walk);
  else geom.coordinates.forEach((poly) => poly.forEach(walk));
  return [[minLng, minLat], [maxLng, maxLat]];
};

const generateDots = (feature, spacing = 20) => {
  const dots = [];
  const [[minLng, minLat], [maxLng, maxLat]] = boundsOf(feature);
  const stepSize = spacing * 0.08;
  for (let lng = minLng; lng <= maxLng; lng += stepSize) {
    for (let lat = minLat; lat <= maxLat; lat += stepSize) {
      const point = [lng, lat];
      if (pointInFeature(point, feature)) dots.push({ lng, lat });
    }
  }
  return dots;
};

const land = JSON.parse(readFileSync(landPath, "utf8"));
const dots = [];
for (const feature of land.features) {
  dots.push(...generateDots(feature, 20));
}

writeFileSync(outPath, JSON.stringify(dots));
console.log(`Wrote ${dots.length} dots to ${outPath}`);
