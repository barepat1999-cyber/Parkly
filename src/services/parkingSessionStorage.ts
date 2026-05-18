import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActiveParkingSession } from '../types/parkingBay';

const KEY_SESSION = '@parkly_active_parking_session_v1';
const KEY_COOLDOWN_PREFIX = '@parkly_arrival_cooldown_';

export async function loadActiveSession(): Promise<ActiveParkingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveParkingSession;
    if (!s?.id || !s.parkingBayId || !s.startTime) return null;
    return s;
  } catch {
    return null;
  }
}

export async function saveActiveSession(session: ActiveParkingSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(KEY_SESSION);
    return;
  }
  await AsyncStorage.setItem(KEY_SESSION, JSON.stringify(session));
}

export async function getArrivalCooldownUntil(bayId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_COOLDOWN_PREFIX + bayId);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function setArrivalCooldownUntil(bayId: string, untilMs: number): Promise<void> {
  await AsyncStorage.setItem(KEY_COOLDOWN_PREFIX + bayId, String(untilMs));
}

export async function clearArrivalCooldown(bayId: string): Promise<void> {
  await AsyncStorage.removeItem(KEY_COOLDOWN_PREFIX + bayId);
}
