import { AppState, Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * Native bridge to the Kotlin DirectSmsModule (see android/app/.../DirectSmsModule.kt).
 *
 * On Android we use SmsManager directly so the SOS countdown leads straight
 * to a sent text. On iOS this module simply doesn't exist — Apple does not
 * allow third-party apps to send SMS without the system composer, so the
 * caller falls back to expo-sms there.
 */

type DirectSmsResult = { phone: string; ok: boolean; error?: string };

type DirectSmsNative = {
  isPermissionGranted(): Promise<boolean>;
  sendDirect(phones: string[], message: string): Promise<DirectSmsResult[]>;
};

const native = (NativeModules as { RoadSoSDirectSms?: DirectSmsNative }).RoadSoSDirectSms;

export const isDirectSmsSupported = Platform.OS === 'android' && native != null;

export type SmsPermissionResult = 'granted' | 'denied' | 'blocked';

// In-session cache: once we know SEND_SMS is granted, skip the native bridge
// round-trip on every subsequent SOS. Resets on app restart, AND on every
// foreground transition — covers the case where the user revoked the
// permission via system Settings while the app was backgrounded, which the
// old "reset on PERMISSION_DENIED reply" path only caught AFTER a failed send.
let _grantedCache = false;

if (Platform.OS === 'android') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') _grantedCache = false;
  });
}

/**
 * Ask for SEND_SMS at runtime. On API 23+ Android requires a runtime grant in
 * addition to the manifest declaration.
 *
 * Returns:
 *   'granted'  — permission is active, direct SMS will work
 *   'denied'   — user said "Not now"; will be asked again next time
 *   'blocked'  — user checked "Don't ask again"; must open system Settings
 */
export async function ensureSendSmsPermission(): Promise<SmsPermissionResult> {
  if (_grantedCache) return 'granted';
  if (!isDirectSmsSupported) return 'denied';
  try {
    const already = await native!.isPermissionGranted();
    if (already) {
      _grantedCache = true;
      return 'granted';
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      {
        title: 'Allow RoadSoS to send SMS',
        message:
          'RoadSoS sends a one-shot SMS to your saved emergency contacts when you trigger SOS or a crash is detected.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      _grantedCache = true;
      return 'granted';
    }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}

/** Opens the system app-settings page so the user can unblock SMS permission. */
export function openAppSettings(): void {
  Linking.openSettings();
}

/**
 * Send the same SOS message to every contact phone number directly, without
 * opening the system Messages app. Resolves with a per-recipient status list.
 */
export async function sendDirectSms(phones: string[], message: string): Promise<DirectSmsResult[]> {
  if (!isDirectSmsSupported) {
    return phones.map((phone) => ({ phone, ok: false, error: 'direct sms not supported' }));
  }
  try {
    return await native!.sendDirect(phones, message);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // If the native side reports the permission as no longer granted (user
    // revoked it via Settings mid-session), invalidate the cache so the next
    // call re-requests rather than silently skipping the permission step.
    if (/PERMISSION_DENIED|permission/i.test(reason)) _grantedCache = false;
    return phones.map((phone) => ({ phone, ok: false, error: reason }));
  }
}
