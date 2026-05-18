/**
 * Copenhagen Open Data parking service.
 * Uses bundled zones (offline) first, then API for fresh data.
 *
 * Data: src/data/copenhagenZones.json (115 zones, full Copenhagen)
 * API: https://wfs-kbhkort.kk.dk/k101/ows
 */

import type { ParkingSegment } from '../types/parkingSegment';
import type { Region } from 'react-native-maps';

const WFS_BASE = 'https://wfs-kbhkort.kk.dk/k101/ows';

/** Bundled zones – always available, no network needed */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BUNDLED_ZONES = require('../data/copenhagenZones.json') as { features?: Array<{ type: string; id: string; geometry: { coordinates: unknown }; properties: Record<string, unknown> }> };

type Bbox = { south: number; north: number; west: number; east: number };

function regionToBbox(region: Region, expand = 1.5): Bbox {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  const dLat = (latitudeDelta / 2) * expand;
  const dLng = (longitudeDelta / 2) * expand;
  return {
    south: latitude - dLat,
    north: latitude + dLat,
    west: longitude - dLng,
    east: longitude + dLng,
  };
}

function inBbox(lat: number, lon: number, bbox: Bbox): boolean {
  return lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;
}

/** True if zone bbox overlaps viewport bbox */
function bboxesOverlap(
  zoneLats: number[],
  zoneLons: number[],
  view: Bbox
): boolean {
  const zSouth = Math.min(...zoneLats);
  const zNorth = Math.max(...zoneLats);
  const zWest = Math.min(...zoneLons);
  const zEast = Math.max(...zoneLons);
  return zSouth <= view.north && zNorth >= view.south && zWest <= view.east && zEast >= view.west;
}

/** GeoJSON coordinates: [lon, lat] or nested for Multi* */
type GeoJsonCoords = [number, number] | [number, number][];

/** Flatten GeoJSON coordinates to [lon,lat][] – Point, LineString, Polygon rings, Multi* */
function flattenCoords(
  coords: GeoJsonCoords | GeoJsonCoords[],
  acc: [number, number][] = []
): [number, number][] {
  if (!coords || coords.length === 0) return acc;
  const first = coords[0];
  // Point: [lon, lat] or [lon, lat, z]
  if (typeof first === 'number' && coords.length >= 2 && typeof coords[1] === 'number') {
    acc.push([first, coords[1] as number]);
    return acc;
  }
  if (Array.isArray(first) && typeof first[0] === 'number') {
    (coords as [number, number][]).forEach((p) => acc.push(p));
  } else {
    (coords as GeoJsonCoords[]).forEach((ring) => flattenCoords(ring, acc));
  }
  return acc;
}

type CphParkingSpaceFeature = {
  type: 'Feature';
  id?: string | number;
  geometry?: { type?: string; coordinates?: GeoJsonCoords | GeoJsonCoords[] };
  properties?: {
    vejnavn?: string;
    antal_pladser?: number | string;
    p_ordning?: string;
    p_type?: string;
    bydel?: string;
    id?: string | number;
  };
};

type CphZoneFeature = {
  type: 'Feature';
  id?: string | number;
  geometry?: { type?: string; coordinates?: GeoJsonCoords | GeoJsonCoords[] };
  properties?: {
    kategori?: string;
    navn?: string;
    beskrivelse?: string;
  };
};

type CphFeatureCollection = {
  type: 'FeatureCollection';
  features: (CphParkingSpaceFeature | CphZoneFeature)[];
  numberMatched?: number;
};

function parseSpotCount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return Math.max(1, n);
  }
  return 1;
}

/** Fetch parking spaces (p_pladser). Paginate and filter by bbox. ~29k total in dataset. */
async function fetchParkingSpaces(bbox: Bbox): Promise<CphParkingSpaceFeature[]> {
  const all: CphParkingSpaceFeature[] = [];
  const maxFeatures = 1000;
  const maxPages = 10; // Scan ~10k for fallback when no zones in view
  let startIndex = 0;
  let totalRawPages = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature&typeName=k101:p_pladser&outputFormat=json&SRSNAME=EPSG:4326&maxFeatures=${maxFeatures}&startIndex=${startIndex}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Copenhagen WFS: ${res.status}`);
    const data = (await res.json()) as CphFeatureCollection;
    const rawFeatures = data.features ?? [];
    totalRawPages += rawFeatures.length;
    if (__DEV__ && page === 0) {
      const sample = rawFeatures[0] as Record<string, unknown> | undefined;
      console.debug(
        '[CopenhagenParking] WFS p_pladser raw:',
        'featureCount=',
        rawFeatures.length,
        'keys=',
        sample ? Object.keys(sample) : [],
        'geomKeys=',
        sample?.geometry && typeof sample.geometry === 'object'
          ? Object.keys(sample.geometry as object)
          : []
      );
    }
    const features = rawFeatures.filter((f): f is CphParkingSpaceFeature => f.type === 'Feature');

    if (features.length === 0) break;

    for (const f of features) {
      const c = f.geometry?.coordinates;
      if (c == null) continue;
      const coords = flattenCoords(c as GeoJsonCoords);
      if (coords.length === 0) continue;
      const [lon, lat] = coords[0]!;
      if (inBbox(lat, lon, bbox)) all.push(f);
    }

    if (features.length < maxFeatures) break;
    startIndex += maxFeatures;
    if (all.length >= 800) break; // Cap for render performance
  }

  if (__DEV__) {
    console.debug('[CopenhagenParking] p_pladser raw page total features scanned:', totalRawPages, 'in bbox:', all.length);
  }

  return all;
}

/** Fetch all parking zones (p_zoner_kbh). Small – 115 features. */
async function fetchParkingZones(): Promise<CphZoneFeature[]> {
  const url = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature&typeName=k101:p_zoner_kbh&srsname=EPSG:4326&outputFormat=application%2Fjson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Copenhagen WFS zones: ${res.status}`);
  const data = (await res.json()) as CphFeatureCollection;
  const raw = data.features ?? [];
  if (__DEV__) {
    const sample = raw[0] as Record<string, unknown> | undefined;
    console.debug(
      '[CopenhagenParking] WFS p_zoner_kbh raw:',
      'count=',
      raw.length,
      'keys=',
      sample ? Object.keys(sample) : []
    );
  }
  return raw.filter((f): f is CphZoneFeature => f.type === 'Feature');
}

/**
 * Convert p_pladser line geometry to centerline + polygon coordinates.
 * Each feature is a short line (one or few spots) – we render as polyline.
 */
function parkingSpaceToSegment(
  feat: CphParkingSpaceFeature,
  index: number,
  now: number
): ParkingSegment | null {
  const geom = feat.geometry;
  const rawCoords = geom?.coordinates;
  if (rawCoords == null) return null;
  const coords = flattenCoords(rawCoords as GeoJsonCoords);
  if (coords.length < 2) return null;

  const centerline = coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  const coordinates = centerline.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));

  const props = feat.properties ?? {};
  const labelBase = feat.id ?? props.id ?? index;
  const streetName =
    typeof props.vejnavn === 'string' && props.vejnavn.trim().length > 0
      ? props.vejnavn
      : `P-plads ${labelBase}`;
  const totalSpots = parseSpotCount(props.antal_pladser);
  const zoneType = typeof props.p_ordning === 'string' ? props.p_ordning : undefined;

  const estimatedOccupiedSpots = Math.round(totalSpots * 0.6);
  const estimatedFreeSpots = Math.max(0, totalSpots - estimatedOccupiedSpots);

  const id = `cph-${labelBase}`;

  return {
    id,
    streetName,
    coordinates,
    centerline,
    totalSpots,
    estimatedFreeSpots,
    estimatedOccupiedSpots,
    zoneType,
    source: 'copenhagen',
    lastUpdated: now,
    confidence: 0.7,
  };
}

/**
 * Convert zone polygon to segment. Zones are large – we use centroid + boundary.
 */
function zoneToSegment(
  feat: CphZoneFeature,
  bbox: Bbox,
  index: number,
  now: number
): ParkingSegment | null {
  const rawCoords = feat.geometry?.coordinates;
  if (rawCoords == null) return null;
  const coords = flattenCoords(rawCoords as GeoJsonCoords);
  if (coords.length < 2) return null;
  const lats = coords.map(([, lat]) => lat);
  const lons = coords.map(([lon]) => lon);
  if (!bboxesOverlap(lats, lons, bbox)) return null;

  const centerline = coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  const p = feat.properties ?? {};
  const streetName = p.beskrivelse ?? p.navn ?? p.kategori ?? `Zone ${index}`;
  const zoneType = typeof p.kategori === 'string' ? p.kategori : undefined;

  // Zones don't have spot counts – estimate from polygon area (~15 spots per 100m²)
  const areaApprox = coords.length * 0.0001; // rough proxy
  const totalSpots = Math.max(3, Math.round(areaApprox * 150));
  const estimatedOccupiedSpots = Math.round(totalSpots * 0.6);
  const estimatedFreeSpots = Math.max(0, totalSpots - estimatedOccupiedSpots);

  return {
    id: `cph-zone-${feat.id ?? index}`,
    streetName,
    coordinates: centerline.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    centerline,
    totalSpots,
    estimatedFreeSpots,
    estimatedOccupiedSpots,
    zoneType,
    source: 'copenhagen',
    lastUpdated: now,
    confidence: 0.6,
  };
}

/** Load zones from bundled JSON – no network, always works. Returns all zones in viewport. */
function getBundledZoneSegments(bbox: Bbox): ParkingSegment[] {
  const zones = BUNDLED_ZONES.features ?? [];
  const now = Date.now();
  const segments: ParkingSegment[] = [];
  for (let i = 0; i < zones.length; i++) {
    const feat = zones[i]! as CphZoneFeature;
    const seg = zoneToSegment(feat, bbox, i, now);
    if (seg) segments.push(seg);
  }
  if (__DEV__) {
    console.debug(
      '[CopenhagenParking] bundled raw records:',
      zones.length,
      'valid zone segments:',
      segments.length
    );
  }
  return segments;
}

/** Load ALL bundled zones – no bbox filter. Use when viewport filter returns few. */
function getAllBundledZoneSegments(): ParkingSegment[] {
  const zones = BUNDLED_ZONES.features ?? [];
  const now = Date.now();
  const segments: ParkingSegment[] = [];
  const fullBbox: Bbox = { south: 55.6, north: 55.75, west: 12.45, east: 12.65 };
  for (let i = 0; i < zones.length; i++) {
    const feat = zones[i]! as CphZoneFeature;
    const seg = zoneToSegment(feat, fullBbox, i, now);
    if (seg) segments.push(seg);
  }
  return segments;
}

/**
 * Fetch Copenhagen parking data. Uses bundled zones first (offline), then API if needed.
 * Never throws – returns [] on unexpected failure so callers can fall back to OSM.
 */
export async function getCopenhagenParkingSegments(
  region: Region
): Promise<ParkingSegment[]> {
  try {
    const bbox = regionToBbox(region);
    const now = Date.now();

    let bundled = getBundledZoneSegments(bbox);
    if (bundled.length < 10) bundled = getAllBundledZoneSegments();
    if (bundled.length > 0) {
      const finalBundled = bundled.slice(0, 150);
      if (__DEV__) {
        console.debug('[CopenhagenParking] final rendered segments (bundled):', finalBundled.length);
      }
      return finalBundled;
    }

    try {
      const zones = await fetchParkingZones();
      const segments: ParkingSegment[] = [];
      for (let i = 0; i < zones.length; i++) {
        const seg = zoneToSegment(zones[i]!, bbox, i, now);
        if (seg) segments.push(seg);
      }
      if (__DEV__) {
        console.debug(
          '[CopenhagenParking] WFS zones raw:',
          zones.length,
          'valid zone segments:',
          segments.length
        );
      }
      if (segments.length > 0) {
        if (__DEV__) console.debug('[CopenhagenParking] final rendered segments (WFS zones):', segments.length);
        return segments;
      }

      const spaces = await fetchParkingSpaces(bbox);
      let validFromSpaces = 0;
      for (let i = 0; i < spaces.length; i++) {
        const seg = parkingSpaceToSegment(spaces[i]!, i, now);
        if (seg) {
          segments.push(seg);
          validFromSpaces += 1;
        }
      }
      if (__DEV__) {
        console.debug(
          '[CopenhagenParking] p_pladser in bbox:',
          spaces.length,
          'valid parking-space segments:',
          validFromSpaces
        );
        console.debug('[CopenhagenParking] final rendered segments (WFS spaces):', segments.length);
      }
      return segments;
    } catch (e) {
      if (__DEV__) console.warn('[CopenhagenParking] WFS API failed:', e);
      try {
        return getBundledZoneSegments(regionToBbox(region, 3));
      } catch (fallbackErr) {
        if (__DEV__) console.warn('[CopenhagenParking] bundled fallback failed:', fallbackErr);
        return [];
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[CopenhagenParking] getCopenhagenParkingSegments failed:', e);
    return [];
  }
}
