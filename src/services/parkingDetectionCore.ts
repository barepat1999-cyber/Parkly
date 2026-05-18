import type { ParkingSegment } from '../types/parkingSegment';
import { distancePointToPolylineMeters } from '../utils/parkingBayGeometry';
import { distanceMeters } from '../utils/geo';
import {
  PARKING_BAY_MATCH_RADIUS_M,
  STATIONARY_DRIFT_MAX_M,
  MAX_SPEED_MPS_FOR_STOPPED,
  LEAVE_PROMPT_DISTANCE_M,
  AUTO_RELEASE_DISTANCE_M,
  AUTO_RELEASE_MIN_SPEED_MPS,
  ENABLE_AUTO_RELEASE,
} from '../constants/parkingDetection';

export type NearestBayResult = {
  segment: ParkingSegment;
  distanceM: number;
};

/** Find nearest mapped segment by distance from user to centerline (meters) */
export function findNearestBay(
  lat: number,
  lon: number,
  segments: ParkingSegment[]
): NearestBayResult | null {
  if (segments.length === 0) return null;
  let best: NearestBayResult | null = null;
  for (const segment of segments) {
    const cl = segment.centerline;
    if (cl.length < 1) continue;
    const d = distancePointToPolylineMeters(lat, lon, cl);
    if (!best || d < best.distanceM) {
      best = { segment, distanceM: d };
    }
  }
  return best;
}

export function isWithinBayRadius(distanceM: number): boolean {
  return distanceM <= PARKING_BAY_MATCH_RADIUS_M;
}

export function isLikelyStopped(speedMps: number | null | undefined): boolean {
  if (speedMps == null || speedMps < 0) return true;
  return speedMps < MAX_SPEED_MPS_FOR_STOPPED;
}

export function isStationaryDrift(
  startLat: number,
  startLon: number,
  curLat: number,
  curLon: number
): boolean {
  return distanceMeters(startLat, startLon, curLat, curLon) <= STATIONARY_DRIFT_MAX_M;
}

/** Distance from user to bay centerline for “leave” detection */
export function distanceToBay(lat: number, lon: number, segment: ParkingSegment): number {
  return distancePointToPolylineMeters(lat, lon, segment.centerline);
}

export function shouldPromptLeave(distanceM: number): boolean {
  return distanceM > LEAVE_PROMPT_DISTANCE_M;
}

export type AutoReleaseCheck = {
  shouldRelease: boolean;
  confidence: number;
};

/**
 * Simple high-confidence auto-release: far from bay + moving fast.
 * Disabled entirely when ENABLE_AUTO_RELEASE is false.
 */
export function evaluateAutoRelease(
  distanceToBayM: number,
  speedMps: number | null | undefined
): AutoReleaseCheck {
  if (!ENABLE_AUTO_RELEASE) {
    return { shouldRelease: false, confidence: 0 };
  }
  const speedOk =
    speedMps != null && speedMps >= 0 && speedMps >= AUTO_RELEASE_MIN_SPEED_MPS;
  const far = distanceToBayM >= AUTO_RELEASE_DISTANCE_M;
  if (far && speedOk) {
    return { shouldRelease: true, confidence: 0.85 };
  }
  return { shouldRelease: false, confidence: 0 };
}
