#!/usr/bin/env node
/**
 * OSM “scan” af København i overlappende bidder (Overpass).
 * Output: src/data/copenhagenOsmParkingSegments.json
 *
 * Kør: npm run fetch:copenhagen-parking
 * Kræver netværk. Pause mellem bbox for fair use.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../src/data/copenhagenOsmParkingSegments.json');

/**
 * overpass-api.de giver ofte 504 når den er overbelastet; spejle svarer typisk bedre.
 * Rækkefølge: prøv fr først, derefter private.coffee, til sidst de.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const FETCH_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'User-Agent': 'ParklyOSMFetch/1.0 (+https://github.com/)',
};

/** Pause mellem hver Overpass-forespørgsel (fair use). */
const INTER_QUERY_MS = 5000;
/** Ekstra pause efter HTTP 429. */
const AFTER_429_MS = 90000;

/** Overlappende rektangler ~det meste af inner Copenhagen + Amager (matcher appens hovedstads-bbox ca.). */
const BBOXES = [
  { name: 'Frederiksberg', s: 55.663, w: 12.464, n: 55.699, e: 12.556 },
  { name: 'Indre By', s: 55.667, w: 12.555, n: 55.692, e: 12.595 },
  { name: 'Vesterbro', s: 55.657, w: 12.53, n: 55.685, e: 12.565 },
  { name: 'Nørrebro', s: 55.685, w: 12.54, n: 55.71, e: 12.575 },
  { name: 'Østerbro', s: 55.695, w: 12.555, n: 55.72, e: 12.605 },
  { name: 'Amager (indre)', s: 55.655, w: 12.575, n: 55.685, e: 12.65 },
  { name: 'Valby', s: 55.655, w: 12.485, n: 55.68, e: 12.535 },
  { name: 'Nordvest', s: 55.705, w: 12.515, n: 55.73, e: 12.56 },
  { name: 'Amager syd', s: 55.635, w: 12.585, n: 55.665, e: 12.65 },
];

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

/** To queries pr. lille bbox (samme som Frederiksberg-script). */
function queriesForBbox(s, w, n, e) {
  const B = `${s},${w},${n},${e}`;
  return [
    `[out:json][timeout:120];
(
  way["parking:lane"](${B});
  way["parking:condition"](${B});
  way["parking:both"](${B});
  way["parking:left"](${B});
  way["parking:right"](${B});
);
out geom;`,
    `[out:json][timeout:120];
(
  way["amenity"="parking"](${B});
);
out geom;`,
  ];
}

async function fetchOverpass(query, attempt = 1) {
  const endpoint = OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length];
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: FETCH_HEADERS,
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(300000),
    });
  } catch (err) {
    if (attempt < 12) {
      const wait = 12000 + 4000 * attempt;
      console.warn(`Overpass netværksfejl (${err?.message ?? err}), venter ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      return fetchOverpass(query, attempt + 1);
    }
    throw err;
  }
  const retryable =
    res.status === 504 ||
    res.status === 429 ||
    res.status === 502 ||
    res.status === 503 ||
    res.status === 403;
  if (retryable) {
    if (attempt < 24) {
      const wait429 =
        res.status === 429
          ? AFTER_429_MS
          : res.status === 504
            ? Math.min(120000, 15000 + 8000 * attempt)
            : Math.min(90000, 8000 + 5000 * attempt);
      console.warn(`Overpass ${res.status} (${endpoint}), prøver igen om ${wait429 / 1000}s (forsøg ${attempt})…`);
      await new Promise((r) => setTimeout(r, wait429));
      return fetchOverpass(query, attempt + 1);
    }
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`Henter OSM-parkering for ${BBOXES.length} områder (2 Overpass-kald pr. område)…`);
  const wayById = new Map();
  let totalRaw = 0;

  for (let b = 0; b < BBOXES.length; b++) {
    const box = BBOXES[b];
    const { name, s, w, n, e } = box;
    console.log(`[${b + 1}/${BBOXES.length}] ${name} (${s},${w},${n},${e})`);
    const qs = queriesForBbox(s, w, n, e);
    for (let q = 0; q < qs.length; q++) {
      if (b > 0 || q > 0) await new Promise((r) => setTimeout(r, INTER_QUERY_MS));
      const data = await fetchOverpass(qs[q]);
      const elements = data.elements || [];
      for (const el of elements) {
        if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
        if (!wayById.has(el.id)) {
          wayById.set(el.id, el);
          totalRaw++;
        }
      }
    }
  }

  const now = Date.now();
  const segments = [];
  const seenSeg = new Set();
  for (const way of wayById.values()) {
    const seg = wayToSegment(way, now);
    if (!seg || seenSeg.has(seg.id)) continue;
    seenSeg.add(seg.id);
    segments.push(seg);
  }

  console.log(`Unikke ways: ${wayById.size}, segmenter efter filter: ${segments.length}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(segments, null, 0) + '\n', 'utf8');
  console.log('Skrev:', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
