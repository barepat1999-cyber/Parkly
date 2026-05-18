import type { ParkingSegment } from '../types/parkingSegment';
import type { ParkingBay, ParkingBayStatus } from '../types/parkingBay';
import { distanceMeters } from './geo';

export type LatLng = { latitude: number; longitude: number };

/** Midpoint of centerline — stable “bay anchor” for distances */
export function centerlineMidpoint(centerline: LatLng[]): LatLng {
  if (centerline.length === 0) return { latitude: 0, longitude: 0 };
  const mid = Math.floor(centerline.length / 2);
  return { ...centerline[mid]! };
}

/** Closest point on segment AB to P (planar approx — fine for small distances). */
function closestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const dLat = b.latitude - a.latitude;
  const dLon = b.longitude - a.longitude;
  const len2 = dLat * dLat + dLon * dLon;
  if (len2 < 1e-20) return { ...a };
  let t =
    ((p.latitude - a.latitude) * dLat + (p.longitude - a.longitude) * dLon) / len2;
  t = Math.max(0, Math.min(1, t));
  return {
    latitude: a.latitude + t * dLat,
    longitude: a.longitude + t * dLon,
  };
}

/** Minimum distance from a point to a polyline (centerline), in meters */
export function distancePointToPolylineMeters(lat: number, lon: number, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return distanceMeters(lat, lon, polyline[0]!.latitude, polyline[0]!.longitude);
  }
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const c = closestPointOnSegment({ latitude: lat, longitude: lon }, a, b);
    const d = distanceMeters(lat, lon, c.latitude, c.longitude);
    min = Math.min(min, d);
  }
  return min;
}

export function segmentToParkingBay(
  segment: ParkingSegment,
  status: ParkingBayStatus,
  occupiedByCurrentUser: boolean
): ParkingBay {
  const anchor = centerlineMidpoint(segment.centerline);
  return {
    id: segment.id,
    streetName: segment.streetName,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    status,
    lastUpdated: Date.now(),
    occupiedByCurrentUser,
  };
}
