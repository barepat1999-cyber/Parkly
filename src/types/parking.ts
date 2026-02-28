export interface ParkingSpot {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

/** Location-based parking report (single source of truth in ReportStore) */
export interface ParkingReport {
  id: string;
  createdAt: number; // timestamp
  latitude: number;
  longitude: number;
  status: 'available' | 'occupied';
  accuracy?: number;
  /** Set when synced from Firestore (for Profile filtering by userId) */
  userId?: string;
}

/** Format time as HH:mm (colon, local time) */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Format date label: "i dag" | "i går" | "ddd dd/mm" */
export function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() === today.getTime()) return 'i dag';
  if (dayStart.getTime() === yesterday.getTime()) return 'i går';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const weekdays = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
  const weekday = weekdays[d.getDay()];
  return `${weekday} ${day}/${month}`;
}

/** Legacy spot-based report (parkingStorage + aggregation only) */
export interface LegacyParkingReport {
  id: string;
  spotId: string;
  status: 'free' | 'occupied';
  createdAt: number;
}

export interface AggregatedStatus {
  spotId: string;
  status: 'free' | 'occupied' | 'unknown';
  confidence: number; // 0-1
  lastUpdatedAt?: number; // timestamp
}

export interface ParkingArea {
  id: string;
  name: string;
  polygon: { latitude: number; longitude: number }[];
}
