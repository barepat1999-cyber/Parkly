import type { Region } from 'react-native-maps';
import type { ParkingSegment } from '../types/parkingSegment';
import { getCopenhagenParkingSegments } from './copenhagenParkingDataService';
import { STATIC_COPENHAGEN_SEGMENTS } from '../data/copenhagenSegments';

// Bundlet OSM-scan af København i bidder (opdater med: npm run fetch:copenhagen-parking)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COPENHAGEN_OSM_BUNDLED_SEGMENTS = require('../data/copenhagenOsmParkingSegments.json') as ParkingSegment[];

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Meters of road per parking spot (1 spot per 6 m). */
const METERS_PER_SPOT = 6;

/** OSM highway values to drop (not street parking context). */
const EXCLUDED_HIGHWAYS = new Set([
  'footway',
  'cycleway',
  'path',
  'pedestrian',
  'steps',
  'bridleway',
  'corridor',
  'elevator',
]);

/** Max OSM segments when Copenhagen inventory is empty (strict fallback). */
const MAX_OSM_SEGMENTS_FALLBACK = 120;
/**
 * When Copenhagen (bundled/WFS) already returns data, still merge OSM for streets that KK data
 * does not cover — e.g. Frederiksberg (separate kommune) and gaps. Capped to limit Overpass load.
 */
const MAX_OSM_SEGMENTS_SUPPLEMENT = 100;
/** Extra OSM rows when viewport overlaps Frederiksberg (kommune med eget vejnet). */
const MAX_OSM_SEGMENTS_FREDERIKSBERG = 165;

/** Max segments returned to the map (all sources). */
const MAX_MERGED_SEGMENTS = 220;

/** Approx. Frederiksberg kommune — unioneres med viewport for OSM så hele området kan hentes. */
const FREDERIKSBERG_BBOX = {
  south: 55.663,
  north: 55.699,
  west: 12.464,
  east: 12.556,
} as const;

/** Greater Copenhagen map area used for OSM + static merge (includes Frederiksberg). */
function isCapitalAreaRegion(region: Region): boolean {
  const { latitude: lat, longitude: lon } = region;
  return lat >= 55.6 && lat <= 55.75 && lon >= 12.45 && lon <= 12.65;
}

function viewportOverlapsFrederiksberg(region: Region): boolean {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  const south = latitude - latitudeDelta / 2;
  const north = latitude + latitudeDelta / 2;
  const west = longitude - longitudeDelta / 2;
  const east = longitude + longitudeDelta / 2;
  return (
    south <= FREDERIKSBERG_BBOX.north &&
    north >= FREDERIKSBERG_BBOX.south &&
    west <= FREDERIKSBERG_BBOX.east &&
    east >= FREDERIKSBERG_BBOX.west
  );
}

/** Udvider OSM-bbox til at omfatte hele Frederiksberg når kortet rører kommunen — flere gadeparkeringslinjer. */
function unionRegionWithFrederiksberg(region: Region): Region {
  if (!viewportOverlapsFrederiksberg(region)) return region;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  let south = latitude - latitudeDelta / 2;
  let north = latitude + latitudeDelta / 2;
  let west = longitude - longitudeDelta / 2;
  let east = longitude + longitudeDelta / 2;
  south = Math.min(south, FREDERIKSBERG_BBOX.south);
  north = Math.max(north, FREDERIKSBERG_BBOX.north);
  west = Math.min(west, FREDERIKSBERG_BBOX.west);
  east = Math.max(east, FREDERIKSBERG_BBOX.east);
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    latitudeDelta: Math.max(north - south, 0.002),
    longitudeDelta: Math.max(east - west, 0.002),
  };
}

type OsmWay = {
  type: string;
  id: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string | undefined> & {
    name?: string;
    highway?: string;
    'parking:lane'?: string;
    'parking:condition'?: string;
    'parking:both'?: string;
    'parking:left'?: string;
    'parking:right'?: string;
  };
};

type OverpassResponse = {
  elements?: OsmWay[];
};

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Street-parking–related tags (must have at least one). */
function hasParkingRelatedTag(tags: OsmWay['tags']): boolean {
  if (!tags) return false;
  return (
    tags['parking:lane'] != null ||
    tags['parking:condition'] != null ||
    tags['parking:both'] != null ||
    tags['parking:left'] != null ||
    tags['parking:right'] != null
  );
}

function isValidParkingWay(way: OsmWay): boolean {
  if (way.type !== 'way' || !Array.isArray(way.geometry)) return false;
  const t = way.tags;
  if (!t || Object.keys(t).length === 0) return false;
  if (!hasParkingRelatedTag(t)) return false;
  if (shouldExcludeWayForHighway(t)) return false;
  return true;
}

function shouldExcludeWayForHighway(tags: OsmWay['tags']): boolean {
  const h = tags?.highway;
  if (!h) return false;
  return EXCLUDED_HIGHWAYS.has(h);
}

/** Remove consecutive duplicate / near-duplicate points (ordered along way). */
function dedupeGeometry(geom: { lat: number; lon: number }[]): { lat: number; lon: number }[] {
  if (geom.length < 2) return geom;
  const out: { lat: number; lon: number }[] = [geom[0]!];
  for (let i = 1; i < geom.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = geom[i]!;
    if (haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon) > 0.1) {
      out.push(cur);
    }
  }
  return out.length >= 2 ? out : geom;
}

/**
 * One ParkingSegment per OSM way: full centerline along the way, length = sum of edges.
 */
function wayToSingleParkingSegment(way: OsmWay, now: number): ParkingSegment | null {
  const raw = way.geometry;
  if (!raw || raw.length < 2) return null;
  const geom = dedupeGeometry(raw);
  if (geom.length < 2) return null;
  let lengthM = 0;
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1]!;
    const b = geom[i]!;
    lengthM += haversineMeters(a.lat, a.lon, b.lat, b.lon);
  }
  const centerline = geom.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const coordinates = centerline.map((p) => ({ ...p }));
  const streetName = way.tags?.name ?? `Vej ${way.id}`;
  const { totalSpots, estimatedFreeSpots, estimatedOccupiedSpots } =
    estimateSpotsFromLength(lengthM);
  return {
    id: `generated-${way.id}`,
    streetName,
    coordinates,
    centerline,
    totalSpots,
    estimatedFreeSpots,
    estimatedOccupiedSpots,
    source: 'generated',
    lastUpdated: now,
    confidence: 0.4,
  };
}

/**
 * Estimate parking spots from segment length: 1 spot per 6 m.
 * estimatedFreeSpots = estimatedOccupiedSpots = totalSpots * 0.5.
 */
function estimateSpotsFromLength(lengthM: number): {
  totalSpots: number;
  estimatedFreeSpots: number;
  estimatedOccupiedSpots: number;
} {
  const totalSpots = Math.max(1, Math.floor(lengthM / METERS_PER_SPOT));
  const half = Math.floor(totalSpots * 0.5);
  return {
    totalSpots,
    estimatedFreeSpots: half,
    estimatedOccupiedSpots: totalSpots - half,
  };
}

function buildRegion(
  regionOrLat: Region | number,
  lng?: number,
  latDelta?: number,
  lngDelta?: number
): Region {
  const lat =
    typeof regionOrLat === 'number' ? regionOrLat : regionOrLat.latitude;
  const lon =
    typeof regionOrLat === 'number' ? (lng ?? 0) : regionOrLat.longitude;
  const dLat =
    typeof regionOrLat === 'number'
      ? (latDelta ?? 0.05)
      : regionOrLat.latitudeDelta;
  const dLng =
    typeof regionOrLat === 'number'
      ? (lngDelta ?? 0.05)
      : regionOrLat.longitudeDelta;
  return {
    latitude: lat,
    longitude: lon,
    latitudeDelta: dLat,
    longitudeDelta: dLng,
  };
}

/** Fetch OSM-based parking segments (fallback when Copenhagen data unavailable). */
async function fetchOsmSegments(region: Region): Promise<ParkingSegment[]> {
  const r = unionRegionWithFrederiksberg(region);
  const { latitude: lat, longitude: lon, latitudeDelta: dLat, longitudeDelta: dLng } = r;
  const south = lat - dLat / 2;
  const north = lat + dLat / 2;
  const west = lon - dLng / 2;
  const east = lon + dLng / 2;
  /** Bbox (south,west,north,east); union of common street-parking keys */
  const query = `[out:json][timeout:25];
(
  way["parking:lane"](${south},${west},${north},${east});
  way["parking:condition"](${south},${west},${north},${east});
  way["parking:both"](${south},${west},${north},${east});
  way["parking:left"](${south},${west},${north},${east});
  way["parking:right"](${south},${west},${north},${east});
);
out geom;`;
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Overpass: ${res.status}`);
  const data = (await res.json()) as OverpassResponse;
  const rawWays = (data.elements ?? []).filter((e): e is OsmWay => e.type === 'way');

  let parkingTagged = 0;
  for (const w of rawWays) {
    if (hasParkingRelatedTag(w.tags)) parkingTagged += 1;
  }

  const now = Date.now();
  const filteredSegments: ParkingSegment[] = [];

  for (const way of rawWays) {
    if (!isValidParkingWay(way)) continue;
    const seg = wayToSingleParkingSegment(way, now);
    if (seg) filteredSegments.push(seg);
  }

  if (__DEV__) {
    console.log('[ParkingInventory] OSM raw ways:', rawWays.length);
    console.log('[ParkingInventory] OSM ways with parking tags:', parkingTagged);
    console.log('[ParkingInventory] OSM valid street-parking ways:', filteredSegments.length);
    console.log('VALID PARKING SEGMENTS:', filteredSegments.length);
  }

  return filteredSegments;
}

/**
 * Fetch parking segments for the given region.
 * Fetches Copenhagen zones + OSM in parallel, merges for max coverage.
 */
export async function getParkingSegmentsInRegion(
  regionOrLat: Region | number,
  lng?: number,
  latDelta?: number,
  lngDelta?: number
): Promise<ParkingSegment[]> {
  const region = buildRegion(regionOrLat, lng, latDelta, lngDelta);
  const inCapitalArea = isCapitalAreaRegion(region);

  let cph: ParkingSegment[] = [];
  try {
    cph = await getCopenhagenParkingSegments(region);
  } catch (e) {
    if (__DEV__) console.warn('[ParkingInventory] Copenhagen failed:', e);
    cph = [];
  }

  let osm: ParkingSegment[] = [];
  if (inCapitalArea) {
    try {
      osm = await fetchOsmSegments(region);
      const cap =
        cph.length === 0
          ? MAX_OSM_SEGMENTS_FALLBACK
          : viewportOverlapsFrederiksberg(region)
            ? MAX_OSM_SEGMENTS_FREDERIKSBERG
            : MAX_OSM_SEGMENTS_SUPPLEMENT;
      osm = osm.slice(0, cap);
      if (__DEV__) {
        console.debug(
          '[ParkingInventory] OSM:',
          osm.length,
          cph.length === 0 ? 'fallback (no Copenhagen)' : 'supplement (e.g. Frederiksberg / OSM-only streets)'
        );
      }
    } catch (e) {
      if (__DEV__) console.warn('[ParkingInventory] OSM failed:', e);
      osm = [];
    }
  }

  const { latitude: lat, longitude: lon, latitudeDelta: dLat, longitudeDelta: dLng } = region;
  const isCopenhagen = inCapitalArea;
  const south = lat - dLat / 2;
  const north = lat + dLat / 2;
  const west = lon - dLng / 2;
  const east = lon + dLng / 2;

  /** For Copenhagen: static segments are the guaranteed base. API/OSM supplement on top. */
  const seen = new Set<string>();
  const merged: ParkingSegment[] = [];
  let staticInView = 0;

  if (isCopenhagen) {
    for (const seg of STATIC_COPENHAGEN_SEGMENTS) {
      const first = seg.centerline[0];
      if (!first) continue;
      const inView =
        first.latitude >= south &&
        first.latitude <= north &&
        first.longitude >= west &&
        first.longitude <= east;
      if (inView && !seen.has(seg.id)) {
        merged.push(seg);
        seen.add(seg.id);
        staticInView += 1;
      }
    }
    if (__DEV__) console.debug('[ParkingInventory] Static base:', staticInView, 'segments in view');
  }

  for (const seg of cph) {
    if (!seen.has(seg.id)) {
      merged.push(seg);
      seen.add(seg.id);
    }
  }

  /** Bundlet OSM-lag (København i bidder — egen kortbase). */
  if (isCopenhagen && COPENHAGEN_OSM_BUNDLED_SEGMENTS.length > 0) {
    let bundledInView = 0;
    for (const seg of COPENHAGEN_OSM_BUNDLED_SEGMENTS) {
      const first = seg.centerline[0];
      if (!first) continue;
      const inView =
        first.latitude >= south &&
        first.latitude <= north &&
        first.longitude >= west &&
        first.longitude <= east;
      if (inView && !seen.has(seg.id)) {
        merged.push(seg);
        seen.add(seg.id);
        bundledInView += 1;
      }
    }
    if (__DEV__) console.debug('[ParkingInventory] Copenhagen OSM bundled:', bundledInView, 'segments in view');
  }

  /** Manual (curated) segments override generated: skip generated if very close to existing manual. */
  const manualMidpoints = merged.map((s) => {
    const c = s.centerline;
    const n = c.length;
    if (n === 0) return null;
    const lat = c.reduce((a, p) => a + p.latitude, 0) / n;
    const lon = c.reduce((a, p) => a + p.longitude, 0) / n;
    return { lat, lon };
  }).filter((p): p is { lat: number; lon: number } => p != null);
  const OVERRIDE_RADIUS_M = 50;

  for (const seg of osm) {
    if (seen.has(seg.id)) continue;
    const c = seg.centerline;
    if (c.length === 0) continue;
    const midLat = c.reduce((a, p) => a + p.latitude, 0) / c.length;
    const midLon = c.reduce((a, p) => a + p.longitude, 0) / c.length;
    const tooClose = manualMidpoints.some(
      (m) => haversineMeters(midLat, midLon, m.lat, m.lon) < OVERRIDE_RADIUS_M
    );
    if (tooClose) continue;
    merged.push(seg);
    seen.add(seg.id);
  }

  const mergeCap = isCopenhagen ? Math.max(MAX_MERGED_SEGMENTS, 500) : MAX_MERGED_SEGMENTS;
  if (__DEV__) {
    console.debug(
      '[ParkingInventory] Final rendered segments:',
      merged.length,
      { staticInView, copenhagenSegments: cph.length, osmCandidates: osm.length, cap: mergeCap }
    );
  }
  return merged.slice(0, mergeCap);
}

export type ParkingInventorySource = 'osm' | 'api' | 'copenhagen';

let currentSource: ParkingInventorySource = 'copenhagen';

export function setParkingInventorySource(source: ParkingInventorySource): void {
  currentSource = source;
}
