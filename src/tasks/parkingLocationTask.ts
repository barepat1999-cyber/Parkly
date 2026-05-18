/**
 * Must be imported early (e.g. from app/_layout) so TaskManager.registerTaskAsync works.
 * Background location updates require UIBackgroundModes location + “Always” when app is in background.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { dispatchParkingLocationFromTask } from '../services/parkingLocationBridge';

export const PARKING_LOCATION_TASK_NAME = 'parkly-parking-detection-location';

TaskManager.defineTask(PARKING_LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    if (__DEV__) console.warn('[ParkingLocationTask]', error);
    return;
  }
  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const locations = payload?.locations;
  if (!locations?.length) return;
  const loc = locations[locations.length - 1];
  if (loc) dispatchParkingLocationFromTask(loc);
});
