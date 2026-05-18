import type { ParkingDetectionState } from '../types/parkingDetectionState';

/** Short user-facing line for the current parking flow (Danish). */
export function parkingStatusHeadline(state: ParkingDetectionState): string | null {
  switch (state) {
    case 'idle':
      return null;
    case 'near_bay':
      return 'Du er ved en parkeringszone';
    case 'suspected_parking':
      return 'Tjekker om du parkerer…';
    case 'parked':
      return null; /* Active session row shows the main message */
    case 'suspected_leaving':
      return 'Ser ud til du kører væk…';
    case 'left':
      return 'Pladsen er frigivet';
    default:
      return null;
  }
}
