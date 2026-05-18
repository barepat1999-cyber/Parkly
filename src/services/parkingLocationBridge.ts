import type { LocationObject } from 'expo-location';

/**
 * Bridges background TaskManager location callbacks into the React context handler.
 * Registered once from ParkingDetectionProvider.
 */
type Handler = (loc: LocationObject) => void;

let handler: Handler | null = null;

export function setParkingLocationHandler(next: Handler | null): void {
  handler = next;
}

export function dispatchParkingLocationFromTask(loc: LocationObject): void {
  try {
    handler?.(loc);
  } catch {
    /* ignore */
  }
}
