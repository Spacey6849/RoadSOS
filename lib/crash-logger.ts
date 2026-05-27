import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import type { LocationData } from '../types';

export type CrashOutcome = 'sos_sent' | 'cancelled';

export interface CrashLogEntry {
  device_platform: string;
  mode: string;
  sensitivity: string;
  g_force: number;
  jerk_gs: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  outcome: CrashOutcome | null;
  detected_at: string;
}

/**
 * Insert a crash event row as soon as the crash is detected.
 * Returns the row id so outcome can be updated later via resolveCrashLog(id).
 *
 * The id is RETURNED to the caller (not stored in module-level state) — under
 * sensor bounce / rapid-double-fire conditions, two concurrent logCrashDetected
 * calls would otherwise overwrite each other's id and orphan the first row
 * with `outcome=null` forever.
 */
export async function logCrashDetected(
  mode: string,
  sensitivity: string,
  gForce: number,
  jerkGs: number,
  location: LocationData | null,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const entry: CrashLogEntry = {
      device_platform: Platform.OS,
      mode,
      sensitivity,
      g_force: parseFloat(gForce.toFixed(2)),
      jerk_gs: parseFloat(jerkGs.toFixed(1)),
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      address: location?.address ?? null,
      outcome: null,
      detected_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('crash_logs')
      .insert(entry)
      .select('id')
      .single();
    if (!error && data?.id) return data.id as string;
    return null;
  } catch {
    // Never block the SOS flow on a logging failure
    return null;
  }
}

/**
 * Update the outcome column once the user acts on the countdown.
 * Pass the id returned by logCrashDetected().
 */
export async function resolveCrashLog(id: string | null, outcome: CrashOutcome): Promise<void> {
  if (!isSupabaseConfigured || !id) return;
  try {
    await supabase
      .from('crash_logs')
      .update({ outcome })
      .eq('id', id);
  } catch {
    // best-effort
  }
}
