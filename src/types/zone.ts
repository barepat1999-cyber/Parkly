export type Zone = {
  id: string;
  centerLat: number;
  centerLng: number;
  confidenceScore: number;
  reportCount?: number;
  freeCountRecent?: number;
  occupiedCountRecent?: number;
  lastUpdated?: unknown;
};

export type GetZonesNearResponse = {
  zones: Zone[];
};
