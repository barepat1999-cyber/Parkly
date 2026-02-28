import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParkingSpot, LegacyParkingReport } from '../types/parking';
import { SEED_SPOTS } from '../data/seedSpots';

const SPOTS_KEY = '@parkly:spots';
const REPORTS_KEY = '@parkly:reports';
const SPOTS_INITIALIZED_KEY = '@parkly:spots_initialized';

export async function initSpotsOnce(): Promise<void> {
  try {
    const initialized = await AsyncStorage.getItem(SPOTS_INITIALIZED_KEY);
    if (initialized === 'true') {
      return; // Already initialized
    }
    
    await AsyncStorage.setItem(SPOTS_KEY, JSON.stringify(SEED_SPOTS));
    await AsyncStorage.setItem(SPOTS_INITIALIZED_KEY, 'true');
  } catch (error) {
    console.error('Error initializing spots:', error);
  }
}

export async function getSpots(): Promise<ParkingSpot[]> {
  try {
    await initSpotsOnce(); // Ensure spots are initialized
    const data = await AsyncStorage.getItem(SPOTS_KEY);
    return data ? JSON.parse(data) : SEED_SPOTS;
  } catch (error) {
    console.error('Error getting spots:', error);
    return SEED_SPOTS;
  }
}

export async function addReport(report: LegacyParkingReport): Promise<void> {
  try {
    const reports = await getReports();
    reports.push(report);
    await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch (error) {
    console.error('Error adding report:', error);
  }
}

export async function getReports(): Promise<LegacyParkingReport[]> {
  try {
    const data = await AsyncStorage.getItem(REPORTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting reports:', error);
    return [];
  }
}
