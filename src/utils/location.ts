import * as Location from 'expo-location';
import { Alert } from 'react-native';

const ALERT_TITLE = 'Lokation';
const ALERT_DENIED = 'Lokation er nægtet. Åbn Indstillinger og giv Parkly adgang til din position.';
const ALERT_ERROR = 'Kunne ikke hente din position – prøv igen om lidt.';

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export async function getCurrentLocation(): Promise<CurrentLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(ALERT_TITLE, ALERT_DENIED, [{ text: 'OK' }]);
      return null;
    }
    const loc = await Location.getCurrentPositionAsync({});
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
    };
  } catch {
    Alert.alert(ALERT_TITLE, ALERT_ERROR, [{ text: 'OK' }]);
    return null;
  }
}
