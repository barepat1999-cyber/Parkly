/**
 * Persists active parking session + arrival cooldowns (AsyncStorage).
 */

export {
  loadActiveSession,
  saveActiveSession,
  getArrivalCooldownUntil,
  setArrivalCooldownUntil,
  clearArrivalCooldown,
} from './parkingSessionStorage';
