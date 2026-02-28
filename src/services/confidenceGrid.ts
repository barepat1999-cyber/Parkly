import { ParkingReport } from '../types/parking';

/** Cell key: lat,lon rounded to 3 decimals (~100m) */
const DECIMALS = 3;
const SCALE = Math.pow(10, DECIMALS);

function cellKey(lat: number, lon: number): string {
  const latR = Math.round(lat * SCALE) / SCALE;
  const lonR = Math.round(lon * SCALE) / SCALE;
  return `${latR},${lonR}`;
}

/** Half-life for time decay in minutes (newer reports weight more) */
const HALF_LIFE_MIN = 60;

function timeWeight(createdAt: number, now: number): number {
  const minutesAgo = (now - createdAt) / (1000 * 60);
  return Math.pow(0.5, minutesAgo / HALF_LIFE_MIN);
}

/**
 * Grid-based confidence: for each cell, score = sum of (available ? +1 : -1) * timeWeight.
 * Normalize to 0-1: raw score can be negative or positive; map to confidence (0 = occupied, 1 = free).
 */
export function getConfidenceForReports(
  reports: ParkingReport[],
  now: number = Date.now()
): Map<string, number> {
  const cellScores = new Map<string, number>();
  for (const r of reports) {
    const key = cellKey(r.latitude, r.longitude);
    const w = timeWeight(r.createdAt, now);
    const delta = r.status === 'available' ? 1 : -1;
    cellScores.set(key, (cellScores.get(key) ?? 0) + delta * w);
  }
  // Map raw score to 0-1. Raw typically in [-3,3]. Use sigmoid-like: 1 / (1 + e^(-x)) or linear clamp.
  const result = new Map<string, number>();
  cellScores.forEach((score, key) => {
    // Linear: score in [-2,2] -> [0,1]. Clamp.
    const normalized = Math.max(0, Math.min(1, (score + 2) / 4));
    result.set(key, normalized);
  });
  return result;
}

export type ConfidenceCell = {
  latitude: number;
  longitude: number;
  confidence: number;
};

/**
 * Return cells for a viewport (region) for map overlays. Capped at maxCells.
 * Only includes cells that have at least one report (or we could include all in viewport - for now only cells with data).
 */
export function getConfidenceCellsInRegion(
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  reports: ParkingReport[],
  maxCells: number = 200
): ConfidenceCell[] {
  const now = Date.now();
  const confidenceMap = getConfidenceForReports(reports, now);
  const minLat = region.latitude - region.latitudeDelta / 2;
  const maxLat = region.latitude + region.latitudeDelta / 2;
  const minLon = region.longitude - region.longitudeDelta / 2;
  const maxLon = region.longitude + region.longitudeDelta / 2;

  const cells: ConfidenceCell[] = [];
  confidenceMap.forEach((confidence, key) => {
    const [latStr, lonStr] = key.split(',');
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      cells.push({ latitude: lat, longitude: lon, confidence });
    }
  });
  // Sort by confidence descending so we show most relevant; take first maxCells
  cells.sort((a, b) => b.confidence - a.confidence);
  return cells.slice(0, maxCells);
}
