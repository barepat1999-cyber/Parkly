import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@parkly/map_debug_mode';

export function useMapDebugMode(): {
  debugMode: boolean;
  ready: boolean;
  setDebugMode: (value: boolean) => void;
  toggleDebugMode: () => void;
} {
  const [debugMode, setDebugModeState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!cancelled) {
          setDebugModeState(v === '1');
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setDebugMode = useCallback((value: boolean) => {
    setDebugModeState(value);
    void AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  }, []);

  const toggleDebugMode = useCallback(() => {
    setDebugModeState((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return { debugMode, ready, setDebugMode, toggleDebugMode };
}
