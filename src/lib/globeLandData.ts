import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

const LAND_GEOJSON_URL = "/geo/ne_110m_land.json";
const LAND_DOTS_COMPACT_URL = "/geo/ne_110m_land_dots_compact.json";

export interface GlobeDot {
  lng: number;
  lat: number;
}

export interface GlobeLandCache {
  landFeatures: FeatureCollection;
  dots: GlobeDot[];
}

type LandFeature = Feature<Polygon | MultiPolygon>;

let cache: GlobeLandCache | null = null;
let inflight: Promise<GlobeLandCache> | null = null;

const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
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

const pointInFeature = (point: [number, number], feature: LandFeature): boolean => {
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

const generateDotsInPolygon = (feature: LandFeature, dotSpacing = 16): GlobeDot[] => {
  const dots: GlobeDot[] = [];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const walk = (coords: number[][]) => {
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

  const stepSize = dotSpacing * 0.08;
  for (let lng = minLng; lng <= maxLng; lng += stepSize) {
    for (let lat = minLat; lat <= maxLat; lat += stepSize) {
      const point: [number, number] = [lng, lat];
      if (pointInFeature(point, feature)) dots.push({ lng, lat });
    }
  }
  return dots;
};

const buildCacheFromLand = (landFeatures: FeatureCollection, compact: boolean): GlobeLandCache => {
  const spacing = compact ? 20 : 16;
  const dots: GlobeDot[] = [];
  landFeatures.features.forEach((feature) => {
    dots.push(...generateDotsInPolygon(feature as LandFeature, spacing));
  });
  return { landFeatures, dots };
};

/** Warm globe land data as soon as the user is authenticated. */
export function prefetchGlobeLandData(compact = true) {
  return loadGlobeLandData(compact);
}

export function getGlobeLandCache() {
  return cache;
}

export async function loadGlobeLandData(compact = true): Promise<GlobeLandCache> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const [landRes, dotsRes] = await Promise.all([
      fetch(LAND_GEOJSON_URL, { cache: "force-cache" }),
      compact
        ? fetch(LAND_DOTS_COMPACT_URL, { cache: "force-cache" })
        : Promise.resolve(null),
    ]);
    if (!landRes.ok) throw new Error("Failed to load land data");
    const landFeatures = (await landRes.json()) as FeatureCollection;

    if (compact && dotsRes?.ok) {
      const dots = (await dotsRes.json()) as GlobeDot[];
      cache = { landFeatures, dots };
      return cache;
    }

    cache = buildCacheFromLand(landFeatures, compact);
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
