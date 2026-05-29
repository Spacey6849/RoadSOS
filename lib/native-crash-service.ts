/**
 * JS wrapper for the native Android CrashDetectionService.
 *
 * The native service runs the full crash algorithm in Kotlin with a real
 * foreground service + PARTIAL_WAKE_LOCK, so the sensor loop survives screen-off
 * and the JS thread being killed. This module bridges control to that service.
 *
 * On iOS (or if the native module isn't linked), all calls are no-ops — the
 * JS useCrashDetector hook handles detection on those platforms.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { AppMode } from '../types';

const { RoadSoSCrashDetection } = NativeModules;

export const isNativeCrashServiceAvailable =
  Platform.OS === 'android' && !!RoadSoSCrashDetection;

let _emitter: NativeEventEmitter | null = null;
function getEmitter(): NativeEventEmitter | null {
  if (!isNativeCrashServiceAvailable) return null;
  if (!_emitter) _emitter = new NativeEventEmitter(RoadSoSCrashDetection);
  return _emitter;
}

const EVENT_NAME = 'RoadSoSCrashDetected';

export async function startNativeCrashService(
  mode: AppMode,
  sensitivity: string
): Promise<boolean> {
  if (!isNativeCrashServiceAvailable) return false;
  try {
    await RoadSoSCrashDetection.startService(mode, sensitivity);
    return true;
  } catch {
    return false;
  }
}

export async function stopNativeCrashService(): Promise<boolean> {
  if (!isNativeCrashServiceAvailable) return false;
  try {
    await RoadSoSCrashDetection.stopService();
    return true;
  } catch {
    return false;
  }
}

export async function updateNativeCrashConfig(
  mode: AppMode,
  sensitivity: string
): Promise<boolean> {
  if (!isNativeCrashServiceAvailable) return false;
  try {
    await RoadSoSCrashDetection.updateConfig(mode, sensitivity);
    return true;
  } catch {
    return false;
  }
}

/** Stop the native service's countdown so the auto-SOS does NOT fire. */
export async function cancelNativeCountdown(): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try {
    await RoadSoSCrashDetection.cancelCountdown();
  } catch {
    // ignore — no countdown running
  }
}

/** Skip the remaining countdown and have the native service fire the SOS now. */
export async function sendNativeSosNow(): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try {
    await RoadSoSCrashDetection.sendSosNow();
  } catch {
    // ignore
  }
}

/** Dev/testing — trigger the full native crash flow without a real impact. */
export async function simulateNativeCrash(): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try {
    await RoadSoSCrashDetection.simulateCrash();
  } catch {
    // ignore
  }
}

export async function stopNativeVibration(): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try {
    await RoadSoSCrashDetection.stopVibration();
  } catch {
    // ignore — vibrator may already be stopped
  }
}

/**
 * Returns true if the native service detected a crash while JS was not running.
 * Clears the flag atomically — call once on app resume.
 */
export async function consumeNativePendingCrash(): Promise<boolean> {
  if (!isNativeCrashServiceAvailable) return false;
  try {
    return await RoadSoSCrashDetection.hasPendingCrash();
  } catch {
    return false;
  }
}

/**
 * Subscribe to live crash events emitted by the native service while JS is running.
 * Returns an unsubscribe function.
 */
export async function storeLocationNative(lat: number, lng: number, address: string): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try { await RoadSoSCrashDetection.storeLocation(lat, lng, address); } catch {}
}

export async function storeContactsNative(phones: string[], names: string[]): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try { await RoadSoSCrashDetection.storeContacts(phones, names); } catch {}
}

export async function storeUserNameNative(name: string): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try { await RoadSoSCrashDetection.storeUserName(name); } catch {}
}

/** Persist the device id so native crash inserts carry it (own-crash filter). */
export async function storeDeviceIdNative(deviceId: string): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try { await RoadSoSCrashDetection.storeDeviceId(deviceId); } catch {}
}

/**
 * Persist blood group + medical info so the native SMS template can include
 * them when SOS fires while JS is dead. Empty strings clear individual fields.
 */
export async function storeMedicalInfoNative(
  bloodGroup: string,
  allergies: string,
  medications: string,
  conditions: string,
): Promise<void> {
  if (!isNativeCrashServiceAvailable) return;
  try {
    await RoadSoSCrashDetection.storeMedicalInfo(
      bloodGroup ?? '',
      allergies ?? '',
      medications ?? '',
      conditions ?? '',
    );
  } catch {}
}

export function subscribeNativeCrashEvent(handler: () => void): () => void {
  const emitter = getEmitter();
  if (!emitter) return () => {};
  const sub = emitter.addListener(EVENT_NAME, handler);
  return () => sub.remove();
}
