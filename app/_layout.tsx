import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReportStoreProvider } from '../src/store/ReportStoreContext';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <ReportStoreProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ReportStoreProvider>
    </>
  );
}
