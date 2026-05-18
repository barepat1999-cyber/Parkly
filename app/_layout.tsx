import { useEffect } from 'react';
/** Registers TaskManager.defineTask before any location start — required for background updates on iOS. */
import '../src/tasks/parkingLocationTask';
import '../src/config/firebaseLogLevel';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, View, StyleSheet } from 'react-native';
import { ReportStoreProvider } from '../src/store/ReportStoreContext';
import { ParkingDetectionProvider } from '../src/store/ParkingDetectionContext';
import { syncProfileFromFirebase } from '../src/services/userProfileService';

// Suppress Firebase and internal service logs from appearing in LogBox / warning banner
LogBox.ignoreLogs([
  '@firebase/',
  '[Firebase]',
  '[ReportStore]',
  '[reportService]',
  '[confirmationService]',
  '[Map]',
  '[location]',
  '[History]',
  'Firestore is not initialized',
  'Firebase Auth is not initialized',
]);

export default function RootLayout() {
  useEffect(() => {
    syncProfileFromFirebase();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      <ReportStoreProvider>
        <ParkingDetectionProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ParkingDetectionProvider>
      </ReportStoreProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
