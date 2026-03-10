import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { ReportStoreProvider } from '../src/store/ReportStoreContext';

export default function RootLayout() {
  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      <ReportStoreProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ReportStoreProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
