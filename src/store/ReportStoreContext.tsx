import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ParkingReport } from '../types/parking';
import {
  ReportStore,
  ReportStatus,
  reportsGroupedByDayFromReports,
  dayStreakFromReports,
} from '../storage/reportStore';
import {
  subscribeReports,
  toParkingReport,
  ensureAuth,
} from '../services/reportService';
import { hasValidConfig } from '../config/firebase';

export type ReportByDay = { dateKey: string; label: string; reports: ParkingReport[] };

export type TimeFilterValue = '15' | '30' | '60' | 'all';

function filterReportsByTime(reports: ParkingReport[], filter: TimeFilterValue): ParkingReport[] {
  if (filter === 'all') return reports;
  const minutes = parseInt(filter, 10);
  const cutoff = Date.now() - minutes * 60 * 1000;
  return reports.filter((r) => r.createdAt >= cutoff);
}

type ReportStoreContextValue = {
  reports: ParkingReport[];
  filteredReports: ParkingReport[];
  timeFilter: TimeFilterValue;
  setTimeFilter: (f: TimeFilterValue) => void;
  totalReports: number;
  dayStreak: number;
  reportsGroupedByDay: ReportByDay[];
  reportsByDay: ReportByDay[];
  addReport: (status: ReportStatus, location: { latitude: number; longitude: number; accuracy?: number }) => Promise<void>;
  removeReport: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  isReady: boolean;
};

const ReportStoreContext = createContext<ReportStoreContextValue | null>(null);

const SYNC_SINCE_MINUTES = 24 * 60;

export function ReportStoreProvider({ children }: { children: React.ReactNode }) {
  const [reports, setReports] = useState<ParkingReport[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>('all');

  useEffect(() => {
    let cancelled = false;
    ReportStore.load().then(async () => {
      if (cancelled) return;
      setReports(ReportStore.getReports());
      setIsReady(true);

      if (hasValidConfig) {
        try {
          const uid = await ensureAuth();
          ReportStore.setCurrentUserId(uid);
        } catch (e) {
          if (__DEV__) console.warn('[ReportStore] ensureAuth failed:', e);
        }
      }
    });
    const unsub = ReportStore.subscribe(() => {
      if (!cancelled) setReports(ReportStore.getReports());
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!hasValidConfig) return;
    const unsub = subscribeReports(
      (firestoreReports) => {
        const parkingReports = firestoreReports.map(toParkingReport);
        ReportStore.setReportsRemote(parkingReports);
      },
      { sinceMinutes: SYNC_SINCE_MINUTES }
    );
    return () => unsub();
  }, []);

  const addReport = useCallback(
    async (status: ReportStatus, location: { latitude: number; longitude: number; accuracy?: number }) => {
      await ReportStore.addReport(status, location);
    },
    []
  );
  const removeReport = useCallback(async (id: string) => {
    await ReportStore.removeReport(id);
  }, []);
  const clearAll = useCallback(async () => {
    await ReportStore.clearAll();
  }, []);

  const filteredReports = filterReportsByTime(reports, timeFilter);
  const reportsByDay = reportsGroupedByDayFromReports(filteredReports);
  const value: ReportStoreContextValue = {
    reports,
    filteredReports,
    timeFilter,
    setTimeFilter,
    totalReports: ReportStore.totalReports,
    dayStreak: ReportStore.dayStreak,
    reportsGroupedByDay: reportsByDay,
    reportsByDay,
    addReport,
    removeReport,
    clearAll,
    isReady,
  };

  return (
    <ReportStoreContext.Provider value={value}>
      {children}
    </ReportStoreContext.Provider>
  );
}

export function useReportStore(): ReportStoreContextValue {
  const ctx = useContext(ReportStoreContext);
  if (!ctx) throw new Error('useReportStore must be used within ReportStoreProvider');
  return ctx;
}
