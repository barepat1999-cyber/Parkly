import type { ParkingReport } from '../types/parking';

/** Override parameters – tweak here. All timestamps in ms (epoch). */
export const SPOT_STATUS_OVERRIDE_PARAMS = {
  occupiedOverrideCount: 2,
  occupiedOverrideWindowMinutes: 10,
  freeOverrideCount: 2,
  freeOverrideWindowMinutes: 5,
} as const;

export type FinalStatus = 'available' | 'occupied';
export type DebugReason = 'latest-wins' | 'occupied-override' | 'free-override';

export type ComputeFinalStatusResult = {
  finalStatus: FinalStatus;
  lastUpdated: number;
  debugReason: DebugReason;
};

/**
 * Compute final status for a spot from its reports.
 * Rules (in order):
 * 1. FREE override: >= freeOverrideCount FREE reports in last freeOverrideWindowMinutes → FREE
 * 2. OCCUPIED override: >= occupiedOverrideCount OCCUPIED reports in last occupiedOverrideWindowMinutes → OCCUPIED
 * 3. Else: latest report wins
 *
 * @param reports Reports for the spot, sorted newest first (createdAt desc)
 * @param now Current time in ms (Date.now())
 */
export function computeFinalStatus(
  reports: ParkingReport[],
  now: number = Date.now(),
  params: typeof SPOT_STATUS_OVERRIDE_PARAMS = SPOT_STATUS_OVERRIDE_PARAMS
): ComputeFinalStatusResult {
  const latest = reports[0];
  const lastUpdated = latest?.createdAt ?? 0;

  if (reports.length === 0) {
    return { finalStatus: 'occupied', lastUpdated: 0, debugReason: 'latest-wins' };
  }

  const freeWindowMs = params.freeOverrideWindowMinutes * 60 * 1000;
  const occupiedWindowMs = params.occupiedOverrideWindowMinutes * 60 * 1000;

  const freeInWindow = reports.filter(
    (r) => r.status === 'available' && now - r.createdAt <= freeWindowMs
  );
  const occupiedInWindow = reports.filter(
    (r) => r.status === 'occupied' && now - r.createdAt <= occupiedWindowMs
  );

  if (freeInWindow.length >= params.freeOverrideCount) {
    return { finalStatus: 'available', lastUpdated, debugReason: 'free-override' };
  }
  if (occupiedInWindow.length >= params.occupiedOverrideCount) {
    return { finalStatus: 'occupied', lastUpdated, debugReason: 'occupied-override' };
  }

  return {
    finalStatus: (latest!.status as FinalStatus),
    lastUpdated,
    debugReason: 'latest-wins',
  };
}
