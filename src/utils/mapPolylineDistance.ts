import { distanceMeters } from './geo';

/**
 * Minimum distance from a point to any vertex of a polyline (fast; good enough for map emphasis).
 */
export function minDistanceMetersToPolylineVertices(
  lat: number,
  lon: number,
  coords: { latitude: number; longitude: number }[]
): number {
  if (coords.length === 0) return Infinity;
  let min = Infinity;
  for (const p of coords) {
    const d = distanceMeters(lat, lon, p.latitude, p.longitude);
    if (d < min) min = d;
  }
  return min;
}
