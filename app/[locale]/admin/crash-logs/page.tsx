'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/lib/useIsMobile';

interface CrashLog {
  id: string;
  detected_at: string;
  device_platform: string;
  mode: string;
  sensitivity: string;
  g_force: number;
  jerk_gs: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  outcome: string;
}

function outcomeColor(outcome: string): string {
  if (outcome === 'sos_sent') return 'var(--red)';
  if (outcome === 'cancelled') return 'var(--amber)';
  return 'var(--text-faint)';
}

function outcomeBg(outcome: string): string {
  if (outcome === 'sos_sent') return 'color-mix(in srgb, var(--red) 8%, transparent)';
  if (outcome === 'cancelled') return 'color-mix(in srgb, var(--amber) 6%, transparent)';
  return 'transparent';
}

export default function CrashLogsPage() {
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState<CrashLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortByGForce, setSortByGForce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('crash_logs')
      .select('id,detected_at,device_platform,mode,sensitivity,g_force,jerk_gs,latitude,longitude,address,outcome')
      .order('detected_at', { ascending: false })
      .limit(100);
    if (data) setLogs(data as CrashLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = sortByGForce
    ? [...logs].sort((a, b) => (b.g_force ?? 0) - (a.g_force ?? 0))
    : logs;

  const sosSent = logs.filter(l => l.outcome === 'sos_sent').length;
  const cancelled = logs.filter(l => l.outcome === 'cancelled').length;
  const maxG = logs.length ? Math.max(...logs.map(l => l.g_force ?? 0)).toFixed(2) : '—';

  return (
    <div style={{ padding: isMobile ? '18px 14px' : '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 4 }}>Admin / Crash Logs</p>
          <h1 style={{ fontSize: 24, fontWeight: 300, color: 'var(--text-primary)', letterSpacing: -0.5 }}>Crash Severity Inspector</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{logs.length} entries</p>
        </div>
        <button onClick={load} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 5, height: 32, padding: '0 12px', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >↻ Refresh</button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'SOS Sent', value: sosSent, color: 'var(--red)' },
          { label: 'Cancelled', value: cancelled, color: 'var(--amber)' },
          { label: 'Peak G-Force', value: maxG, color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: s.color }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : logs.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontFamily: 'var(--font-mono)', fontSize: 12 }}>No crash logs found</p>
      ) : isMobile ? (
        // ── Mobile: card list (the 8-column table doesn't fit on phones)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayed.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{
                background: outcomeBg(log.outcome),
                border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
                borderLeft: `3px solid ${outcomeColor(log.outcome)}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(log.detected_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: outcomeColor(log.outcome), fontWeight: 600 }}>
                  {log.outcome || 'pending'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                {log.address || (log.latitude ? `${log.latitude.toFixed(4)}, ${log.longitude?.toFixed(4)}` : '— no location —')}
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: (log.g_force ?? 0) > 3 ? 'var(--red)' : (log.g_force ?? 0) > 1.5 ? 'var(--amber)' : 'var(--text-primary)', fontWeight: 600 }}>
                  {log.g_force != null ? `${log.g_force.toFixed(2)}g` : '—g'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>jerk {log.jerk_gs != null ? log.jerk_gs.toFixed(1) : '—'}</span>
                <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{log.mode || '—'} · {log.sensitivity || '—'}</span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 80px 70px 1fr 90px 90px 1fr 90px', gap: 0, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            {['Time', 'Mode', 'Sens.', 'Location', 'G-Force ↕', 'Jerk g/s', 'Platform', 'Outcome'].map((h, i) => (
              <span key={h}
                onClick={i === 4 ? () => setSortByGForce(s => !s) : undefined}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: i === 4 ? (sortByGForce ? 'var(--text-primary)' : 'var(--text-muted)') : 'var(--text-muted)', cursor: i === 4 ? 'pointer' : 'default', userSelect: 'none' }}
              >{h}</span>
            ))}
          </div>

          {displayed.map((log, idx) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 80px 70px 1fr 90px 90px 1fr 90px',
                gap: 0,
                padding: '9px 16px',
                borderBottom: idx < displayed.length - 1 ? '0.5px solid var(--border)' : 'none',
                background: outcomeBg(log.outcome),
                alignItems: 'center',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = outcomeBg(log.outcome); }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {new Date(log.detected_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{log.mode || '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{log.sensitivity || '—'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {log.address || (log.latitude ? `${log.latitude.toFixed(4)}, ${log.longitude?.toFixed(4)}` : '—')}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: (log.g_force ?? 0) > 3 ? 'var(--red)' : (log.g_force ?? 0) > 1.5 ? 'var(--amber)' : 'var(--text-primary)' }}>
                {log.g_force != null ? `${log.g_force.toFixed(2)}g` : '—'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {log.jerk_gs != null ? `${log.jerk_gs.toFixed(1)}` : '—'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.device_platform || '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: outcomeColor(log.outcome), fontWeight: 600 }}>
                {log.outcome || 'pending'}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
