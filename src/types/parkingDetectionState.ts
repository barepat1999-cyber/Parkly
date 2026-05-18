/**
 * Parking detection UX state machine (one visual “mode” at a time).
 *
 * See docs/PARKING_DETECTION_STATES.md for transitions.
 */
export type ParkingDetectionState =
  | 'idle'
  | 'near_bay'
  | 'suspected_parking'
  | 'parked'
  | 'suspected_leaving'
  | 'left';
