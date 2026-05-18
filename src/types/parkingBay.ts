/**
 * Local parking-bay model for semi-automatic detection (MVP).
 * Maps 1:1 to a mapped inventory segment id (see ParkingSegment).
 */

export type ParkingBayStatus = 'free' | 'occupied' | 'unknown';

export type ParkingBay = {
  id: string;
  /** Display name from inventory segment when available */
  streetName?: string;
  latitude: number;
  longitude: number;
  status: ParkingBayStatus;
  lastUpdated: number;
  /** True when this bay is tied to the current user’s confirmed session */
  occupiedByCurrentUser: boolean;
};

export type ActiveParkingSession = {
  id: string;
  parkingBayId: string;
  startTime: number;
  endTime?: number;
  isActive: boolean;
  /** Optional heuristic confidence for auto-release (0–1) */
  confidenceScore?: number;
};
