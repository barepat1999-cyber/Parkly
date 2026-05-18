#!/usr/bin/env node
/**
 * Henter gadeparkering + parkeringsarealer i Frederiksberg fra OpenStreetMap (Overpass API).
 * Kør: node scripts/fetch-frederiksberg-parking-osm.mjs
 * Output: src/data/frederiksbergParkingSegments.json
 *
 * Kræver netværk. Respekter Overpass fair-use (ikke spam).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../src/data/frederiksbergParkingSegments.json');

/** Samme bbox som i parkingInventoryService (Frederiksberg kommune ca.) */
const S = 55.663;
const W = 12.464;
const N = 55.699;
const E = 12.556;

const OVERPASS = 'https://overpass-api.de/api/interpreter';

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

const METERS_PER_SPOT = 6;

function haversineMeters(lat1, lon1, lat2, lon2) {
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

function hasParkingLaneTag(tags) {
  if (!tags) return false;
  return (
    tags['parking:lane'] != null ||
    tags['parking:condition'] != null ||
    tags['parking:both'] != null ||
    tags['parking:left'] != null ||
    tags['parking:right'] != null
  );
}

function shouldExclude(tags) {
  const h = tags?.highway;
  if (h && EXCLUDED_HIGHWAYS.has(h)) return true;
  if (tags?.access === 'private') return true;
  return false;
}

function dedupeGeometry(geom) {
  if (geom.length < 2) return geom;
  const out = [geom[0]];
  for (let i = 1; i < geom.length; i++) {
    const prev = out[out.length - 1];
    const cur = geom[i];
    if (haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon) > 0.1) out.push(cur);
  }
  return out.length >= 2 ? out : geom;
}

function estimateSpotsFromLength(lengthM) {
  const totalSpots = Math.max(1, Math.floor(lengthM / METERS_PER_SPOT));
  const half = Math.floor(totalSpots * 0.5);
  return {
    totalSpots,
    estimatedFreeSpots: half,
    estimatedOccupiedSpots: totalSpots - half,
  };
}

function wayToSegment(way, now) {
  const tags = way.tags || {};
  const isLane = hasParkingLaneTag(tags);
  const isLot = tags.amenity === 'parking';
  if (!isLane && !isLot) return null;
  if (shouldExclude(tags)) return null;

  const raw = way.geometry;
  if (!raw || raw.length < 2) return null;
  const geom = dedupeGeometry(raw);
  if (geom.length < 2) return null;

  let lengthM = 0;
  for (let i = 1; i < geom.length; i++) {
    lengthM += haversineMeters(geom[i - 1].lat, geom[i - 1].lon, geom[i].lat, geom[i].lon);
  }

  let totalSpots;
  let estimatedFreeSpots;
  let estimatedOccupiedSpots;
  const cap = tags.capacity != null ? parseInt(String(tags.capacity), 10) : NaN;
  if (isLot && Number.isFinite(cap) && cap > 0) {
    totalSpots = cap;
    estimatedFreeSpots = Math.floor(cap * 0.4);
    estimatedOccupiedSpots = cap - estimatedFreeSpots;
  } else {
    ({ totalSpots, estimatedFreeSpots, estimatedOccupiedSpots } = estimateSpotsFromLength(lengthM));
  }

  const centerline = geom.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const coordinates = centerline.map((p) => ({ ...p }));
  const name =
    tags.name ||
    tags['addr:street'] ||
    (isLot ? `Parkeringsplads ${way.id}` : `Vej ${way.id}`);

  return {
    id: `generated-${way.id}`,
    streetName: name,
    coordinates,
    centerline,
    totalSpots,
    estimatedFreeSpots,
    estimatedOccupiedSpots,
    zoneType: isLot ? 'parking_lot' : 'street',
    source: 'osm',
    lastUpdated: now,
    confidence: 0.45,
  };
}

const BBOX = `${S},${W},${N},${E}`;

/** To mindre queries — én stor union giver ofte Overpass 504. */
const QUERIES = [
  `[out:json][timeout:120];
(
  way["parking:lane"](${BBOX});
  way["parking:condition"](${BBOX});
  way["parking:both"](${BBOX});
  way["parking:left"](${BBOX});
  way["parking:right"](${BBOX});
);
out geom;`,
  `[out:json][timeout:120];
(
  way["amenity"="parking"](${BBOX});
);
out geom;`,
];

async function fetchOverpass(query, attempt = 1) {
  const url = `${OVERPASS}?data=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (res.status === 504 || res.status === 429) {
    if (attempt < 3) {
      const wait = 4000 * attempt;
      console.warn(`Overpass ${res.status}, prøver igen om ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      return fetchOverpass(query, attempt + 1);
    }
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Henter Frederiksberg parkering fra OSM (Overpass)…');
  const allElements = [];
  for (let i = 0; i < QUERIES.length; i++) {
    console.log(`Query ${i + 1}/${QUERIES.length}…`);
    const data = await fetchOverpass(QUERIES[i]);
    const elements = data.elements || [];
    for (const el of elements) allElements.push(el);
  }
  const ways = allElements.filter((e) => e.type === 'way' && Array.isArray(e.geometry));
  const now = Date.now();
  const segments = [];
  const seen = new Set();
  for (const way of ways) {
    const seg = wayToSegment(way, now);
    if (!seg || seen.has(seg.id)) continue;
    seen.add(seg.id);
    segments.push(seg);
  }
  console.log(`Fundet ${ways.length} ways, ${segments.length} segmenter efter filter.`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(segments, null, 0) + '\n', 'utf8');
  console.log('Skrev:', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
