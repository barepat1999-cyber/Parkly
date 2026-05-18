import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParkingReport, formatDateLabel } from '../types/parking';
import { computeDayStreak } from '../utils/streak';
import { canUseFirestore } from '../config/firebase';
import { createReport, ensureAuth } from '../services/reportService';

const REPORTS_KEY = '@parkly:reports';
const PENDING_KEY = '@parkly:pending_reports';

export type ReportStatus = 'available' | 'occupied';

/** Persistence API (AsyncStorage) */
export async function loadReports(): Promise<ParkingReport[]> {
  try {
    const data = await AsyncStorage.getItem(REPORTS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as ParkingReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (__DEV__) console.debug('[ReportStore] load failed:', e);
    return [];
  }
}

export async function saveReports(reports: ParkingReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch (e) {
    if (__DEV__) console.debug('[ReportStore] save failed:', e);
  }
}

export async function clearReports(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REPORTS_KEY);
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (e) {
    if (__DEV__) console.debug('[ReportStore] clear failed:', e);
  }
}

async function loadPending(): Promise<ParkingReport[]> {
  try {
    const data = await AsyncStorage.getItem(PENDING_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as ParkingReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePending(reports: ParkingReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(reports));
  } catch (e) {
    if (__DEV__) console.debug('[ReportStore] savePending failed:', e);
  }
}

/** Group key: YYYY-MM-DD */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Consecutive days with at least one report (delegates to streak util) */
export function dayStreakFromReports(reports: ParkingReport[]): number {
  return computeDayStreak(reports);
}

/** Reports grouped by day (newest day first). Label: i dag / i går / ddd dd/mm */
export function reportsGroupedByDayFromReports(
  reports: ParkingReport[]
): { dateKey: string; label: string; reports: ParkingReport[] }[] {
  const byDay = new Map<string, ParkingReport[]>();
  const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt);
  for (const r of sorted) {
    const key = dayKey(r.createdAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }
  return Array.from(byDay.entries()).map(([dateKey, list]) => ({
    dateKey,
    label: formatDateLabel(list[0]!.createdAt),
    reports: list.sort((a, b) => b.createdAt - a.createdAt),
  }));
}

const SAVE_DEBOUNCE_MS = 400;

/** In-memory store; supports remote sync + local pending for offline */
class ReportStoreClass {
  private reportsRemote: ParkingReport[] = [];
  private pendingReports: ParkingReport[] = [];
  private listeners: Set<() => void> = new Set();
  private loaded = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentUserId: string | null = null;

  private get reports(): ParkingReport[] {
    const remoteIds = new Set(this.reportsRemote.map((r) => r.id));
    const pendingOnly = this.pendingReports.filter((r) => !remoteIds.has(r.id));
    return [...this.reportsRemote, ...pendingOnly].sort((a, b) => b.createdAt - a.createdAt);
  }

  private get myReports(): ParkingReport[] {
    if (!this.currentUserId) return [];
    return this.reports.filter(
      (r) => r.userId === this.currentUserId || r.userId === undefined
    );
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      saveReports(this.reports).catch((e) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[ReportStore] saveReports failed:', e);
      });
    }, SAVE_DEBOUNCE_MS);
  }

  setCurrentUserId(uid: string | null): void {
    this.currentUserId = uid;
    this.emit();
  }

  setReportsRemote(reports: ParkingReport[]): void {
    this.reportsRemote = reports;
    this.emit();
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.pendingReports = await loadPending();
    this.reportsRemote = await loadReports();
    this.loaded = true;
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getReports(): ParkingReport[] {
    return [...this.reports];
  }

  getReportsForProfile(): ParkingReport[] {
    return [...this.myReports];
  }

  get totalReports(): number {
    return this.myReports.length;
  }

  get dayStreak(): number {
    return dayStreakFromReports(this.myReports);
  }

  get reportsGroupedByDay(): { dateKey: string; label: string; reports: ParkingReport[] }[] {
    return reportsGroupedByDayFromReports(this.reports);
  }

  async addReport(
    status: ReportStatus,
    location: { latitude: number; longitude: number; accuracy?: number }
  ): Promise<void> {
    const fireStatus = status === 'available' ? 'free' : 'occupied';
    const tempId = generateId();
    const report: ParkingReport = {
      id: tempId,
      createdAt: Date.now(),
      latitude: location.latitude,
      longitude: location.longitude,
      status,
      accuracy: location.accuracy,
      userId: this.currentUserId ?? undefined,
    };

    // Optimistic: show report immediately
    report.id = `pending-${tempId}`;
    this.pendingReports = [report, ...this.pendingReports];
    await savePending(this.pendingReports);
    this.emit();

    try {
      if (!canUseFirestore()) throw new Error('Firebase not configured');
      const uid = await ensureAuth();
      this.setCurrentUserId(uid);
      const docId = await createReport({
        lat: location.latitude,
        lon: location.longitude,
        status: fireStatus,
      });
      // Replace pending with confirmed
      this.pendingReports = this.pendingReports.filter((r) => r.id !== report.id);
      report.id = docId;
      report.userId = uid;
      this.reportsRemote = [report, ...this.reportsRemote];
      await savePending(this.pendingReports);
      this.emit();
    } catch (e) {
      if (__DEV__) console.warn('[ReportStore] createReport failed (offline?), keeping in pending:', e);
      // Report stays in pendingReports (already added above)
    }
  }

  async removeReport(id: string): Promise<void> {
    if (id.startsWith('pending-')) {
      this.pendingReports = this.pendingReports.filter((r) => r.id !== id);
      await savePending(this.pendingReports);
    } else {
      this.reportsRemote = this.reportsRemote.filter((r) => r.id !== id);
    }
    this.emit();
  }

  async clearAll(): Promise<void> {
    this.reportsRemote = [];
    this.pendingReports = [];
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await clearReports();
    this.emit();
  }
}

export const ReportStore = new ReportStoreClass();
