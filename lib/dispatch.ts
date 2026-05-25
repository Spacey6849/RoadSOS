// Shared types + helpers for the dispatcher → responder assignment flow.
// Channel is `responder-dispatch`; events are `dispatch`, `response`, `cancel`.

import type { CrashLog, Responder } from './types';

export type Severity = 'CRITICAL' | 'MODERATE' | 'MINOR';

export type DispatchPayload = {
  responderId: string;          // target responder (filtered client-side)
  crashId: string;
  lat: number;
  lng: number;
  address?: string;
  gForce: number;
  jerkGs: number;
  severity: Severity;
  attempt: number;              // 1-based, increments when re-broadcast to next nearest
  dispatchedAt: number;
};

export type ResponsePayload = {
  responderId: string;
  crashId: string;
  accepted: boolean;
  attempt: number;
};

export type CancelPayload = {
  responderId: string;
  crashId: string;
};

export const DISPATCH_CHANNEL = 'responder-dispatch';
export const DISPATCH_EVENT = 'dispatch';
export const RESPONSE_EVENT = 'response';
export const CANCEL_EVENT = 'cancel';

// Critical = skip confirm window, dispatch immediately.
// Moderate = 15s confirm window, default to dispatch if dispatcher idle.
// Minor = 60s confirm window (more likely a false positive).
export function classifySeverity(gForce: number, jerkGs: number): Severity {
  if (gForce > 3 || jerkGs > 15) return 'CRITICAL';
  if (gForce > 1.5) return 'MODERATE';
  return 'MINOR';
}

export function confirmWindowMs(sev: Severity): number {
  if (sev === 'CRITICAL') return 0;
  if (sev === 'MODERATE') return 15_000;
  return 60_000;
}

export const ASSIGNMENT_TIMEOUT_MS = 30_000;
export const RESPONDER_STALE_MS = 30_000;       // heartbeat is 8s; 30s = 3-4 missed = off-duty

// Haversine — meters between two lat/lng pairs.
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Sorted by distance, fresh heartbeats only, optionally excluding already-tried ids.
export function rankResponders(
  responders: Responder[],
  crashAt: { lat: number; lng: number },
  excludeIds: Set<string> = new Set(),
  now: number = Date.now(),
): Array<Responder & { distanceM: number }> {
  return responders
    .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .filter(r => !excludeIds.has(r.id))
    .filter(r => now - (r.updatedAt ?? 0) < RESPONDER_STALE_MS)
    .map(r => ({ ...r, distanceM: distanceMeters(crashAt, { lat: r.lat, lng: r.lng }) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

export function buildDispatchPayload(
  crash: CrashLog,
  responderId: string,
  attempt: number,
  severity: Severity,
): DispatchPayload | null {
  if (!crash.location) return null;
  return {
    responderId,
    crashId: crash.id,
    lat: crash.location.lat,
    lng: crash.location.lng,
    address: crash.address,
    gForce: crash.gForce,
    jerkGs: crash.jerkGs,
    severity,
    attempt,
    dispatchedAt: Date.now(),
  };
}
