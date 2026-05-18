import { ParkingReport } from '../types/parking';

/** Cell key: lat,lon rounded to 3 decimals (~100m) for clustering */
const DECIMALS = 3;
const SCALE = Math.pow(10, DECIMALS);

function cellKey(lat: number, lon: number): string {
  const latR = Math.round(lat * SCALE) / SCALE;
  const lonR = Math.round(lon * SCALE) / SCALE;
  return `${latR},${lonR}`;
}

export type HeatmapCell = {
  latitude: number;
  longitude: number;
  /** 0–1: free reports / total reports */
  score: number;
  freeCount: number;
  totalCount: number;
};

/**
 * Aggregate reports by location clusters and compute parking availability score.
 * score = free reports / total reports (0 = all occupied, 1 = all free).
 * Returns cells with valid lat/lon only.
 */
export function getHeatmapCellsInRegion(
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  reports: ParkingReport[],
  maxCells: number = 50
): HeatmapCell[] {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitudeDelta) ||
    !Number.isFinite(longitudeDelta) ||
    latitudeDelta <= 0 ||
    longitudeDelta <= 0
  ) {
    return [];
  }

  const minLat = latitude - latitudeDelta / 2;
  const maxLat = latitude + latitudeDelta / 2;
  const minLon = longitude - longitudeDelta / 2;
  const maxLon = longitude + longitudeDelta / 2;

  const reportsList = reports ?? [];
  const inRegion = reportsList.filter(
    (r) =>
      r.latitude >= minLat &&
      r.latitude <= maxLat &&
      r.longitude >= minLon &&
      r.longitude <= maxLon
  );

  const byCell = new Map<string, { free: number; total: number; lat: number; lon: number }>();
  for (const r of inRegion) {
    const key = cellKey(r.latitude, r.longitude);
    const [latStr, lonStr] = key.split(',');
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (!byCell.has(key)) {
      byCell.set(key, { free: 0, total: 0, lat, lon });
    }
    const cell = byCell.get(key)!;
    cell.total++;
    if (r.status === 'available') cell.free++;
  }

  const cells: HeatmapCell[] = [];
  byCell.forEach(({ free, total, lat, lon }) => {
    const score = total > 0 ? free / total : 0;
    cells.push({ latitude: lat, longitude: lon, score, freeCount: free, totalCount: total });
  });

  cells.sort((a, b) => b.totalCount - a.totalCount);
  return cells.slice(0, maxCells);
}
