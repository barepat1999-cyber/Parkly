import { ParkingReport } from '../types/parking';
import {
  computeFinalStatus,
  SPOT_STATUS_OVERRIDE_PARAMS,
  type FinalStatus,
  type DebugReason,
} from './spotStatusOverride';

const DECIMALS = 4;

/** Spot key: lat/lon rounded to 4 decimals for grouping */
export function spotKey(lat: number, lon: number): string {
  return `${Number(lat.toFixed(DECIMALS))}:${Number(lon.toFixed(DECIMALS))}`;
}

export type SpotGroup = {
  key: string;
  latitude: number;
  longitude: number;
  reports: ParkingReport[]; // newest first
  latest: ParkingReport;
  count: number;
  /** Resolved status after override rules (use for map display) */
  finalStatus: FinalStatus;
  /** Latest report timestamp (ms) */
  lastUpdated: number;
  /** Dev/debug: why this status was chosen */
  debugReason: DebugReason;
};

/**
 * Group reports by spot key (4 decimals). Each group sorted by createdAt desc (latest first).
 * Applies override logic to compute finalStatus (occupied-override, free-override, or latest-wins).
 */
export function groupReportsBySpot(
  reports: ParkingReport[],
  now: number = Date.now()
): SpotGroup[] {
  const byKey = new Map<string, ParkingReport[]>();
  for (const r of reports) {
    const key = spotKey(r.latitude, r.longitude);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const groups: SpotGroup[] = [];
  byKey.forEach((list, key) => {
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    const latest = sorted[0]!;
    const { finalStatus, lastUpdated, debugReason } = computeFinalStatus(
      sorted,
      now,
      SPOT_STATUS_OVERRIDE_PARAMS
    );
    groups.push({
      key,
      latitude: latest.latitude,
      longitude: latest.longitude,
      reports: sorted,
      latest,
      count: sorted.length,
      finalStatus,
      lastUpdated,
      debugReason,
    });
  });
  return groups;
}
