import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as geohash from 'ngeohash';

initializeApp();
const db = getFirestore();

const ZONE_RADIUS_M = 100;
const GEOHASH_PRECISION = 7; // report geohash
const ZONE_GEOHASH_PRECISION = 6; // zone index for queries (~1.2km cell)

/** Haversine distance in meters */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** confidenceScore v1: 1 * (1 + log(reportCount + 1)) */
function confidenceScore(reportCount: number): number {
  return 1 * (1 + Math.log(reportCount + 1));
}

interface ReportData {
  lat?: number;
  lng?: number;
  lon?: number;
  status?: 'free' | 'occupied';
  uid?: string;
}

interface ZoneDoc {
  centerLat: number;
  centerLng: number;
  reportCount: number;
  freeCountRecent: number;
  occupiedCountRecent: number;
  confidenceScore: number;
  lastUpdated: FirebaseFirestore.FieldValue;
  geohash?: string;
}

/** Find zone within 100m of (lat, lon), or null. Uses tx for transaction consistency. */
async function findZoneNearInTransaction(
  tx: FirebaseFirestore.Transaction,
  lat: number,
  lon: number
): Promise<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null> {
  const hash = geohash.encode(lat, lon, ZONE_GEOHASH_PRECISION);
  const hashes = [hash, ...geohash.neighbors(hash)];
  const zonesRef = db.collection('zones');
  let best: { ref: FirebaseFirestore.DocumentReference; dist: number } | null = null;

  for (const h of hashes) {
    const q = zonesRef.where('geohash', '==', h).limit(5);
    const snap = await tx.get(q);
    for (const doc of snap.docs) {
      const d = doc.data();
      const dist = distanceMeters(lat, lon, d.centerLat, d.centerLng);
      if (dist <= ZONE_RADIUS_M && (!best || dist < best.dist)) {
        best = { ref: doc.ref, dist };
      }
    }
  }
  return best?.ref ?? null;
}

export const onReportCreated = onDocumentCreated(
  { document: 'reports/{reportId}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as ReportData;
    const lat = data.lat ?? 0;
    const lon = data.lng ?? data.lon ?? 0;
    const status = data.status ?? 'free';

    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    const reportHash = geohash.encode(lat, lon, GEOHASH_PRECISION);
    const reportRef = snap.ref;

    await db.runTransaction(async (tx) => {
      let zoneRef = await findZoneNearInTransaction(tx, lat, lon);

      if (!zoneRef) {
        zoneRef = db.collection('zones').doc();
        const newZone: ZoneDoc = {
          centerLat: lat,
          centerLng: lon,
          reportCount: 1,
          freeCountRecent: status === 'free' ? 1 : 0,
          occupiedCountRecent: status === 'occupied' ? 1 : 0,
          confidenceScore: confidenceScore(1),
          lastUpdated: FieldValue.serverTimestamp(),
          geohash: geohash.encode(lat, lon, ZONE_GEOHASH_PRECISION),
        };
        tx.set(zoneRef, newZone);
      } else {
        const zoneSnap = await tx.get(zoneRef);
        const z = zoneSnap.data() as ZoneDoc;
        const reportCount = (z.reportCount ?? 0) + 1;
        const freeCountRecent = (z.freeCountRecent ?? 0) + (status === 'free' ? 1 : 0);
        const occupiedCountRecent = (z.occupiedCountRecent ?? 0) + (status === 'occupied' ? 1 : 0);
        tx.update(zoneRef, {
          reportCount,
          freeCountRecent,
          occupiedCountRecent,
          confidenceScore: confidenceScore(reportCount),
          lastUpdated: FieldValue.serverTimestamp(),
        });
      }

      tx.update(reportRef, {
        geohash: reportHash,
        zoneId: zoneRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }
);

interface GetZonesNearRequest {
  lat: number;
  lng: number;
  radiusMeters?: number;
}

/** Extract center lat/lng from zone doc. Supports center: {lat,lng} or centerLat/centerLng. */
function getZoneCenter(d: Record<string, unknown>): { lat: number; lng: number } | null {
  const center = d.center as { lat?: number; lng?: number } | undefined;
  if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
    return { lat: center.lat, lng: center.lng };
  }
  const centerLat = d.centerLat as number | undefined;
  const centerLng = d.centerLng as number | undefined;
  if (typeof centerLat === 'number' && typeof centerLng === 'number') {
    return { lat: centerLat, lng: centerLng };
  }
  return null;
}

export const getZonesNear = onCall<GetZonesNearRequest>(async (request) => {
  const { lat, lng, radiusMeters = 5000 } = request.data ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new HttpsError('invalid-argument', 'lat and lng are required numbers');
  }

  console.log('[getZonesNear] input:', { lat, lng, radiusMeters });

  const zonesRef = db.collection('zones');
  const snap = await zonesRef.get();
  const docsRead = snap.docs.length;
  console.log('[getZonesNear] docs read:', docsRead);

  const results: Array<{
    id: string;
    centerLat: number;
    centerLng: number;
    confidenceScore: number;
    name?: string;
  }> = [];

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const center = getZoneCenter(d);
    if (!center) {
      console.log(`[getZonesNear] Filtered out zone ${doc.id}: missing center.lat/lng or centerLat/centerLng`);
      continue;
    }
    const dist = distanceMeters(lat, lng, center.lat, center.lng);
    if (dist > radiusMeters) {
      console.log(`[getZonesNear] Filtered out zone ${doc.id}: distance ${Math.round(dist)}m > radius ${radiusMeters}m`);
      continue;
    }
    results.push({
      id: doc.id,
      centerLat: center.lat,
      centerLng: center.lng,
      confidenceScore: (d.confidenceScore as number) ?? 0,
      ...(typeof (d.name as string) === 'string' && { name: d.name as string }),
    });
  }

  results.sort((a, b) => b.confidenceScore - a.confidenceScore);
  console.log('[getZonesNear] zones returned:', results.length);
  return { zones: results };
});
