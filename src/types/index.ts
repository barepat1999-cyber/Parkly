export type SpotType = 'street' | 'garage';
export type ReportType = 'free' | 'occupied';
export type SpotStatus = 'likely_free' | 'uncertain' | 'occupied';
export type Source = 'crowd' | 'provider';

export interface Spot {
  id: string;
  lat: number;
  lng: number;
  type: SpotType;
  status: SpotStatus;
  confidence: number; // 0.0 - 1.0
  lastUpdated: Date;
  pricePerHour?: number;
  source: Source;
  providerId?: string;
  availableSpaces?: number; // For garage spots
}

export interface Report {
  id: string;
  userId: string;
  spotId: string;
  reportType: ReportType;
  createdAt: Date;
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  karma: number;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface ParkingProvider {
  id: string;
  name: string;
  fetchSpots(): Promise<Omit<Spot, 'id' | 'status' | 'confidence' | 'lastUpdated'>[]>;
}
