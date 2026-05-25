'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CrashLog } from '@/lib/types';
import { classifySeverity, confirmWindowMs, type Severity } from '@/lib/dispatch';

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: '#FF3B30',
  MODERATE: '#FF9F0A',
  MINOR: '#A8B3C5',
};

// Shown when a non-CRITICAL crash arrives. Dispatcher gets a countdown to
// either Confirm (dispatch a responder) or mark False Alarm. Timer expiry =
// auto-confirm (default-to-dispatch — a distracted dispatcher shouldn't drop
// a real emergency).
export function ConfirmCrashModal({
  crash,
  onConfirm,
  onFalseAlarm,
}: {
  crash: CrashLog | null;
  onConfirm: (crash: CrashLog) => void;
  onFalseAlarm: (crash: CrashLog) => void;
}) {
  const sev: Severity = crash ? classifySeverity(crash.gForce, crash.jerkGs) : 'MINOR';
  const totalMs = confirmWindowMs(sev);
  const [remaining, setRemaining] = useState(totalMs);

  useEffect(() => {
    if (!crash) return;
    setRemaining(totalMs);
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const left = totalMs - (Date.now() - startedAt);
      if (left <= 0) {
        clearInterval(tick);
        onConfirm(crash); // default-to-dispatch
        return;
      }
      setRemaining(left);
    }, 100);
    return () => clearInterval(tick);
  }, [crash, totalMs, onConfirm]);

  const pct = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const secs = Math.ceil(remaining / 1000);
  const color = SEV_COLOR[sev];

  return (
    <AnimatePresence>
      {crash && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(7, 9, 13, 0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, backdropFilter: 'blur(6px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.94, y: 14 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 14 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            style={{
              width: '100%', maxWidth: 460,
              background: 'var(--surface)', border: `1px solid ${color}66`,
              borderRadius: 14, padding: 24, position: 'relative',
              boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px ${color}33`,
            }}
          >
            {/* Severity ribbon */}
            <div style={{
              position: 'absolute', top: -1, left: -1, right: -1, height: 3,
              background: color, borderRadius: '14px 14px 0 0',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color, fontWeight: 700 }}>
                ⚠ NEW SOS · {sev}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                AUTO-CONFIRM IN {secs}s
              </div>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
              Crash detected — confirm dispatch?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginBottom: 16, lineHeight: 1.5 }}>
              Mark as false alarm if the signal looks bogus (phone dropped, pothole, etc).
              Otherwise the nearest on-duty responder will be paged automatically.
            </p>

            {/* Stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              padding: '12px 14px',
              background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
              marginBottom: 14,
            }}>
              <Stat label="G-Force" value={`${crash.gForce.toFixed(2)} g`} />
              <Stat label="Jerk" value={`${crash.jerkGs.toFixed(1)} g/s`} />
              <Stat label="Mode" value={crash.mode || '—'} />
              <Stat label="Location" value={crash.location ? `${crash.location.lat.toFixed(3)}, ${crash.location.lng.toFixed(3)}` : 'unknown'} />
            </div>

            {crash.address && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>ADDR </span>
                {crash.address}
              </div>
            )}

            {/* Timer bar */}
            <div style={{
              height: 4, background: 'var(--bg)', borderRadius: 2,
              marginBottom: 16, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${pct * 100}%`, background: color,
                transition: 'width 100ms linear',
              }} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => onFalseAlarm(crash)}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                ✗ FALSE ALARM
              </button>
              <button
                onClick={() => onConfirm(crash)}
                style={{
                  flex: 2, padding: '12px 16px', borderRadius: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                  background: color, color: '#fff',
                  border: 'none', cursor: 'pointer',
                }}
              >
                ✓ CONFIRM &amp; DISPATCH NEAREST
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
