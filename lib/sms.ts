import { ensureSendSmsPermission, isDirectSmsSupported, openAppSettings, sendDirectSms } from './direct-sms';
import { EmergencyContact, LocationData, MedicalInfo, SMSStatus } from '../types';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Builds an SOS SMS message with user info, location, and medical details.
 * @param userName - Display name of the user sending SOS
 * @param location - GPS coordinates and optional address
 * @param triggerType - Whether triggered by crash detection or manual
 * @param medicalInfo - Optional allergies, medications, conditions
 * @returns Formatted SMS text string
 */
export function buildSOSMessage(
  userName: string,
  location: LocationData,
  triggerType: 'auto' | 'manual',
  medicalInfo?: MedicalInfo
): string {
  const time = formatTime(location.timestamp);
  const trigger = triggerType === 'auto' ? 'auto crash detection' : 'manual SOS';
  const lat = location.lat ?? 0;
  const lng = location.lng ?? 0;
  const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
  const locationStr = location.address || `${lat.toFixed(5)},${lng.toFixed(5)}`;

  let message =
    `🚨 EMERGENCY: ${userName} may need help.\n` +
    `Location: ${locationStr}\n` +
    `Triggered: ${trigger}\n` +
    `Time: ${time}\n` +
    `Map: ${mapLink}`;

  if (medicalInfo && (medicalInfo.allergies || medicalInfo.medications || medicalInfo.conditions)) {
    message +=
      `\n\nMedical Info:\n` +
      `Allergies: ${medicalInfo.allergies || 'None'}\n` +
      `Medications: ${medicalInfo.medications || 'None'}\n` +
      `Conditions: ${medicalInfo.conditions || 'None'}`;
  }

  return message;
}

/**
 * Sends SOS message to emergency contacts via device SMS.
 * Attempts direct SMS first (Android only), then falls back to the system composer.
 * @param contacts - Emergency contacts to notify
 * @param message - Pre-built SOS message string
 * @param incidentId - Unique incident identifier for tracking
 * @param location - GPS coordinates
 * @returns Array of SMS delivery statuses per contact
 */
export type SendSOSResult = {
  statuses: SMSStatus[];
  smsPermissionBlocked: boolean;
};

export async function sendSOS(
  contacts: EmergencyContact[],
  message: string,
  incidentId: string,
  location: LocationData
): Promise<SendSOSResult> {
  let statuses: SMSStatus[] = contacts.map((c) => ({
    contactId: c.id,
    name: c.name,
    phone: c.phone,
    deviceSent: false,
    backupSent: false,
  }));

  const phones = contacts.map((c) => c.phone);
  let smsPermissionBlocked = false;

  // 1) Direct send (Android only). One-tap SOS demands no system composer
  //    interaction — the user already confirmed in the countdown overlay, so
  //    a second tap inside Messages defeats the purpose.
  let directHandled = false;
  if (isDirectSmsSupported && phones.length > 0) {
    try {
      const permission = await ensureSendSmsPermission();
      if (permission === 'granted') {
        const results = await sendDirectSms(phones, message);
        const byPhone = new Map(results.map((r) => [r.phone, r]));
        statuses = statuses.map((s) => {
          const r = byPhone.get(s.phone);
          if (!r) return s;
          return r.ok
            ? { ...s, deviceSent: true }
            : { ...s, error: r.error ?? 'direct send failed' };
        });
        directHandled = statuses.every((s) => s.deviceSent);
      } else {
        if (permission === 'blocked') smsPermissionBlocked = true;
        statuses = statuses.map((s) => ({ ...s, error: 'SEND_SMS permission denied' }));
      }
    } catch (err) {
      if (__DEV__) console.warn('[sms] direct send failed, falling back to composer:', err);
    }
  }

  // 2) Fallback to the system SMS composer when direct send isn't available
  //    (iOS, permission denied, native module missing). This still requires
  //    the user to tap Send, but at least the message is pre-filled.
  if (!directHandled) {
    try {
      const SMS = await import('expo-sms');
      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable && phones.length > 0) {
        const result = await SMS.sendSMSAsync(phones, message);
        if (result?.result === 'sent') {
          statuses = statuses.map((s) => (s.deviceSent ? s : { ...s, deviceSent: true }));
        } else if (result?.result === 'cancelled') {
          statuses = statuses.map((s) =>
            s.deviceSent ? s : { ...s, error: s.error ?? 'User cancelled SMS' },
          );
        } else {
          // Anything else (unknown SDK result, malformed response) is NOT a
          // success. Marking it `deviceSent: true` would silently lie about
          // delivery on the safety-critical SOS path.
          statuses = statuses.map((s) =>
            s.deviceSent ? s : { ...s, error: s.error ?? `SMS composer returned ${result?.result ?? 'unknown'}` },
          );
        }
      }
    } catch {
      statuses = statuses.map((s) => (s.deviceSent ? s : { ...s, error: s.error ?? 'Device SMS failed' }));
    }
  }

  return { statuses, smsPermissionBlocked };
}
