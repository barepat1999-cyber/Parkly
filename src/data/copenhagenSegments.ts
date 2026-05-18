/**
 * Static Copenhagen parking segments – fallback when API returns few.
 * Real street coordinates in central Copenhagen.
 */
import type { ParkingSegment } from '../types/parkingSegment';

const NOW = Date.now();

const SEGMENTS: Omit<ParkingSegment, 'id'>[] = [
  { streetName: 'Vester Voldgade', centerline: [{ latitude: 55.6761, longitude: 12.5683 }, { latitude: 55.6765, longitude: 12.569 }], coordinates: [], totalSpots: 8, estimatedFreeSpots: 3, estimatedOccupiedSpots: 5, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Nørregade', centerline: [{ latitude: 55.6795, longitude: 12.568 }, { latitude: 55.6798, longitude: 12.569 }], coordinates: [], totalSpots: 6, estimatedFreeSpots: 2, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Strøget', centerline: [{ latitude: 55.6775, longitude: 12.574 }, { latitude: 55.6778, longitude: 12.575 }], coordinates: [], totalSpots: 12, estimatedFreeSpots: 5, estimatedOccupiedSpots: 7, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Købmagergade', centerline: [{ latitude: 55.681, longitude: 12.578 }, { latitude: 55.6812, longitude: 12.579 }], coordinates: [], totalSpots: 5, estimatedFreeSpots: 2, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Rådhuspladsen', centerline: [{ latitude: 55.6755, longitude: 12.5685 }, { latitude: 55.6758, longitude: 12.569 }], coordinates: [], totalSpots: 10, estimatedFreeSpots: 4, estimatedOccupiedSpots: 6, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'H.C. Andersens Blvd', centerline: [{ latitude: 55.6745, longitude: 12.565 }, { latitude: 55.6748, longitude: 12.566 }], coordinates: [], totalSpots: 15, estimatedFreeSpots: 6, estimatedOccupiedSpots: 9, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Tietgensgade', centerline: [{ latitude: 55.672, longitude: 12.564 }, { latitude: 55.6723, longitude: 12.565 }], coordinates: [], totalSpots: 7, estimatedFreeSpots: 3, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Istedgade', centerline: [{ latitude: 55.668, longitude: 12.558 }, { latitude: 55.6683, longitude: 12.559 }], coordinates: [], totalSpots: 9, estimatedFreeSpots: 4, estimatedOccupiedSpots: 5, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Vesterbrogade', centerline: [{ latitude: 55.671, longitude: 12.552 }, { latitude: 55.6713, longitude: 12.553 }], coordinates: [], totalSpots: 11, estimatedFreeSpots: 5, estimatedOccupiedSpots: 6, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Nyhavn', centerline: [{ latitude: 55.6792, longitude: 12.590 }, { latitude: 55.6795, longitude: 12.591 }], coordinates: [], totalSpots: 4, estimatedFreeSpots: 1, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Bredgade', centerline: [{ latitude: 55.6825, longitude: 12.584 }, { latitude: 55.6828, longitude: 12.585 }], coordinates: [], totalSpots: 6, estimatedFreeSpots: 2, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Østerbrogade', centerline: [{ latitude: 55.692, longitude: 12.575 }, { latitude: 55.6923, longitude: 12.576 }], coordinates: [], totalSpots: 14, estimatedFreeSpots: 6, estimatedOccupiedSpots: 8, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Nørrebrogade', centerline: [{ latitude: 55.685, longitude: 12.552 }, { latitude: 55.6853, longitude: 12.553 }], coordinates: [], totalSpots: 18, estimatedFreeSpots: 7, estimatedOccupiedSpots: 11, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Frederiksberg Allé', centerline: [{ latitude: 55.673, longitude: 12.538 }, { latitude: 55.6733, longitude: 12.539 }], coordinates: [], totalSpots: 8, estimatedFreeSpots: 3, estimatedOccupiedSpots: 5, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Gothersgade', centerline: [{ latitude: 55.6835, longitude: 12.571 }, { latitude: 55.6838, longitude: 12.572 }], coordinates: [], totalSpots: 5, estimatedFreeSpots: 2, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Pilestræde', centerline: [{ latitude: 55.6782, longitude: 12.576 }, { latitude: 55.6785, longitude: 12.577 }], coordinates: [], totalSpots: 4, estimatedFreeSpots: 1, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Larsbjørnsstræde', centerline: [{ latitude: 55.6798, longitude: 12.568 }, { latitude: 55.6801, longitude: 12.569 }], coordinates: [], totalSpots: 3, estimatedFreeSpots: 1, estimatedOccupiedSpots: 2, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Sankt Peders Stræde', centerline: [{ latitude: 55.6788, longitude: 12.571 }, { latitude: 55.6791, longitude: 12.572 }], coordinates: [], totalSpots: 5, estimatedFreeSpots: 2, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Fiolstræde', centerline: [{ latitude: 55.6805, longitude: 12.574 }, { latitude: 55.6808, longitude: 12.575 }], coordinates: [], totalSpots: 6, estimatedFreeSpots: 2, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Skt. Kannikesstræde', centerline: [{ latitude: 55.6812, longitude: 12.577 }, { latitude: 55.6815, longitude: 12.578 }], coordinates: [], totalSpots: 4, estimatedFreeSpots: 1, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Studiestræde', centerline: [{ latitude: 55.6778, longitude: 12.57 }, { latitude: 55.6781, longitude: 12.571 }], coordinates: [], totalSpots: 7, estimatedFreeSpots: 3, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Vestergade', centerline: [{ latitude: 55.6772, longitude: 12.573 }, { latitude: 55.6775, longitude: 12.574 }], coordinates: [], totalSpots: 5, estimatedFreeSpots: 2, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Lavendelstræde', centerline: [{ latitude: 55.6758, longitude: 12.572 }, { latitude: 55.6761, longitude: 12.573 }], coordinates: [], totalSpots: 4, estimatedFreeSpots: 1, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Møntergade', centerline: [{ latitude: 55.677, longitude: 12.577 }, { latitude: 55.6773, longitude: 12.578 }], coordinates: [], totalSpots: 6, estimatedFreeSpots: 2, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Kronprinsensgade', centerline: [{ latitude: 55.682, longitude: 12.581 }, { latitude: 55.6823, longitude: 12.582 }], coordinates: [], totalSpots: 8, estimatedFreeSpots: 3, estimatedOccupiedSpots: 5, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Store Kongensgade', centerline: [{ latitude: 55.684, longitude: 12.587 }, { latitude: 55.6843, longitude: 12.588 }], coordinates: [], totalSpots: 9, estimatedFreeSpots: 4, estimatedOccupiedSpots: 5, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Amaliegade', centerline: [{ latitude: 55.6818, longitude: 12.592 }, { latitude: 55.6821, longitude: 12.593 }], coordinates: [], totalSpots: 5, estimatedFreeSpots: 2, estimatedOccupiedSpots: 3, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Esplanaden', centerline: [{ latitude: 55.691, longitude: 12.599 }, { latitude: 55.6913, longitude: 12.6 }], coordinates: [], totalSpots: 10, estimatedFreeSpots: 4, estimatedOccupiedSpots: 6, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Holmens Kanal', centerline: [{ latitude: 55.6742, longitude: 12.581 }, { latitude: 55.6745, longitude: 12.582 }], coordinates: [], totalSpots: 7, estimatedFreeSpots: 3, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Knippelsbro', centerline: [{ latitude: 55.6735, longitude: 12.589 }, { latitude: 55.6738, longitude: 12.59 }], coordinates: [], totalSpots: 6, estimatedFreeSpots: 2, estimatedOccupiedSpots: 4, source: 'copenhagen', lastUpdated: NOW },
  { streetName: 'Torvegade', centerline: [{ latitude: 55.6725, longitude: 12.593 }, { latitude: 55.6728, longitude: 12.594 }], coordinates: [], totalSpots: 11, estimatedFreeSpots: 5, estimatedOccupiedSpots: 6, source: 'copenhagen', lastUpdated: NOW },
];

function withCoords(s: Omit<ParkingSegment, 'id'>, i: number): ParkingSegment {
  const coordinates = s.centerline.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  return { ...s, id: `cph-static-${i}`, coordinates };
}

export const STATIC_COPENHAGEN_SEGMENTS: ParkingSegment[] = SEGMENTS.map((s, i) => withCoords(s, i));
