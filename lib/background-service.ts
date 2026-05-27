/**
 * Background crash detection service — unified entry point.
 *
 * On Android, delegates to the native CrashDetectionService (a real foreground
 * service with PARTIAL_WAKE_LOCK) so the sensor loop survives screen-off and
 * the JS thread being killed by Android's memory pressure.
 *
 * On other platforms (iOS / web), falls back to the expo-notifications
 * persistent notification approach, which keeps the JS thread alive on Android 8+
 * but is not as robust.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppMode } from '../types';
import {
  consumeNativePendingCrash,
  isNativeCrashServiceAvailable,
  startNativeCrashService,
  stopNativeCrashService,
  updateNativeCrashConfig,
} from './native-crash-service';

let _N: typeof import('expo-notifications') | null = null;

async function getN() {
  if (_N) return _N;
  try {
    _N = await import('expo-notifications');
  } catch {
    _N = null;
  }
  return _N;
}

const SERVICE_NOTIFICATION_ID = 'roadsos-active-service';
const CRASH_PENDING_KEY = 'roadsos_pending_crash';
const SERVICE_CHANNEL = 'roadsos-service';

export async function setupServiceChannel(): Promise<void> {
  // The native Kotlin foreground service creates its own notification channel
  // on first start (CHANNEL_SERVICE in CrashDetectionService.kt). iOS has no
  // notion of channels, so this is a no-op on every target we ship to.
}

/**
 * Start crash detection background service.
 * On Android: delegates to the native Kotlin foreground service.
 * iOS isn't a target — Apple doesn't allow an equivalent persistent sensor
 * service. The previous expo-notifications "sticky" fallback used several
 * properties (sticky, dismissNotificationAsync) that no longer match the
 * current API and were dead on the Android-only target anyway.
 */
export async function startBackgroundService(mode: AppMode, sensitivity = 'medium'): Promise<void> {
  if (isNativeCrashServiceAvailable) {
    await startNativeCrashService(mode, sensitivity);
  }
}

/** Stop crash detection background service. Android-only delegator. */
export async function stopBackgroundService(): Promise<void> {
  if (isNativeCrashServiceAvailable) {
    await stopNativeCrashService();
  }
}

/**
 * Update the mode/sensitivity when the service is already running.
 */
export async function updateServiceMode(mode: AppMode, sensitivity = 'medium'): Promise<void> {
  if (isNativeCrashServiceAvailable) {
    await updateNativeCrashConfig(mode, sensitivity);
    return;
  }
  return startBackgroundService(mode, sensitivity);
}

/**
 * Store a pending crash event in AsyncStorage. Used when a crash is detected
 * while the app is backgrounded — the home screen reads this on resume and
 * shows the countdown overlay.
 */
export async function storePendingCrash(): Promise<void> {
  await AsyncStorage.setItem(CRASH_PENDING_KEY, String(Date.now()));
}

export async function consumePendingCrash(): Promise<boolean> {
  // Check native SharedPreferences first (written by the Kotlin foreground service)
  if (isNativeCrashServiceAvailable) {
    const nativeCrash = await consumeNativePendingCrash();
    if (nativeCrash) return true;
  }
  // Fallback: check AsyncStorage (written by JS storePendingCrash when native isn't available)
  const val = await AsyncStorage.getItem(CRASH_PENDING_KEY);
  if (!val) return false;
  await AsyncStorage.removeItem(CRASH_PENDING_KEY);
  return Date.now() - Number(val) < 5 * 60 * 1000;
}

/**
 * Fire a high-priority "impact detected" notification. Used when crash is
 * detected while app is in background — wakes the user immediately.
 */
export async function fireCrashNotification(): Promise<void> {
  const N = await getN();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: '⚠️ Impact detected!',
        body: 'RoadSoS will send SOS in 15 seconds. Tap to cancel.',
        sound: true,
        data: { type: 'crash-detected' },
        // @ts-expect-error -- expo-notifications Android extras
        android: {
          channelId: 'crash-alerts',
          priority: 'max',
          vibrate: [0, 500, 200, 500],
        },
      },
      trigger: null,
    });
  } catch (err) {
    if (__DEV__) console.warn('[bg-service] fireCrashNotification failed:', err);
  }
}
