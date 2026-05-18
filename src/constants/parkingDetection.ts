/**
 * Tunable thresholds for parking detection MVP — adjust here for simulator vs device.
 */

/** Max distance from user to bay centerline to count as “at the bay” (meters) */
export const PARKING_BAY_MATCH_RADIUS_M = 35;

/** How long user must stay roughly still near a bay before “likely parked” (ms) */
export const DWELL_BEFORE_ARRIVAL_PROMPT_MS = 12_000;

/** Max movement within dwell window to count as stationary (meters) */
export const STATIONARY_DRIFT_MAX_M = 12;

/** Speed below this (m/s) counts as “stopped” when speed is available */
export const MAX_SPEED_MPS_FOR_STOPPED = 0.8;

/** Distance beyond bay match radius to count as “left the bay area” (meters) */
export const LEAVE_BAY_RADIUS_M = 55;

/** After this distance from bay, consider prompting “have you left?” */
export const LEAVE_PROMPT_DISTANCE_M = 70;

/** Consecutive updates outside leave radius before prompting (noise filter) */
export const LEAVE_PROMPT_CONSECUTIVE_UPDATES = 2;

/**
 * Auto-release (optional): if disabled, only user action ends the session.
 * When enabled, sustained movement far from bay triggers automatic free.
 */
export const ENABLE_AUTO_RELEASE = true;

/** Distance from bay centerline to auto-release (meters) — “uden for pladsen” */
export const AUTO_RELEASE_DISTANCE_M = 90;

/** Min speed (m/s) to count as driving away (city traffic; lower than motorway) */
export const AUTO_RELEASE_MIN_SPEED_MPS = 1.6;

/** Consecutive location updates satisfying auto-release before firing */
export const AUTO_RELEASE_CONSECUTIVE_UPDATES = 3;

/** Cooldown after user taps “No” on arrival — don’t ask again for this bay (ms) */
export const ARRIVAL_REJECT_COOLDOWN_MS = 10 * 60 * 1000;

/** Minimum time between any two arrival prompts (any bay) — reduces alert spam (ms) */
export const MIN_GLOBAL_ARRIVAL_PROMPT_GAP_MS = 45_000;

/**
 * After user says they’re still parked at a leave prompt, wait before asking “have you left?” again.
 */
export const LEAVE_PROMPT_COOLDOWN_MS = 3 * 60 * 1000;

/** Mock mode: use simulated position near first mapped segment (dev only) */
export const PARKING_DETECTION_MOCK_MODE = false;
