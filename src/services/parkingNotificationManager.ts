import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Notification category ids (data.type) for in-app handling */
export const NOTIF_TYPE_ARRIVAL = 'parkly_arrival';
export const NOTIF_TYPE_LEAVE = 'parkly_leave';

const ANDROID_DEFAULT_CHANNEL = 'parkly-default';

let handlerConfigured = false;

/**
 * Show banners while app is foregrounded (iOS/Android).
 * iOS: UNUserNotificationCenter delegate is wired through Expo modules; this handler controls foreground presentation.
 */
export function configureNotificationPresentation(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidDefaultChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
    name: 'Parkly',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  await ensureAndroidDefaultChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return status === 'granted';
}

export async function scheduleArrivalPrompt(bayId: string, streetName?: string): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Parkly',
        body: 'Ser ud til at du parkerer her. Åbn appen for at bekræfte.',
        data: { type: NOTIF_TYPE_ARRIVAL, bayId, streetName: streetName ?? '' },
        sound: Platform.OS === 'ios' ? 'default' : undefined,
      },
      trigger: null, // immediate
      ...(Platform.OS === 'android' ? { channelId: ANDROID_DEFAULT_CHANNEL } : {}),
    });
    return id;
  } catch {
    return null;
  }
}

export async function scheduleLeavePrompt(bayId: string, streetName?: string): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Parkly',
        body: 'Har du forladt pladsen? Åbn appen for at svare.',
        data: { type: NOTIF_TYPE_LEAVE, bayId, streetName: streetName ?? '' },
        sound: Platform.OS === 'ios' ? 'default' : undefined,
      },
      trigger: null,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_DEFAULT_CHANNEL } : {}),
    });
    return id;
  } catch {
    return null;
  }
}

export function addNotificationResponseListener(
  cb: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(cb);
}

export function addNotificationReceivedListener(
  cb: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(cb);
}
