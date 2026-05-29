import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Stable per-install device identifier. Lets a phone query its OWN crash logs
 * (crash_logs.device_id) without any account/login — the user can review and
 * cancel crashes they forgot to dismiss.
 *
 * Generated once, persisted in AsyncStorage, cached in-memory for the session.
 */
const DEVICE_ID_KEY = 'roadsos.device_id';
let cached: string | null = null;

function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = genUuid();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // Storage failure — fall back to an ephemeral id so the app still works.
    if (!cached) cached = genUuid();
    return cached;
  }
}

/** Synchronous read of the cached id (null until getDeviceId has run once). */
export function getCachedDeviceId(): string | null {
  return cached;
}
