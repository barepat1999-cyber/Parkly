/**
 * Parking segment = a street parking area in Copenhagen.
 * Can represent real Copenhagen data, OSM road data, or mock inventory.
 */
export type ParkingSegment = {
  id: string;
  streetName: string;
  /** Polygon coordinates (for fill) – 4 points for buffered road corridor */
  coordinates: { latitude: number; longitude: number }[];
  /** Centerline for Polyline rendering – road center */
  centerline: { latitude: number; longitude: number }[];
  totalSpots: number;
  estimatedFreeSpots: number;
  estimatedOccupiedSpots: number;
  zoneType?: string;
  source: 'copenhagen' | 'osm' | 'mock' | 'generated';
  lastUpdated: number;
  /** 0–1 confidence in occupancy estimate */
  confidence?: number;
};
