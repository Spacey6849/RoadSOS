'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

export default function AdminPage() {
  const { t } = useLanguage();
  const [elapsed, setElapsed] = useState(0);
  const [serviceCount, setServiceCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('services').select('id', { count: 'exact', head: true }).then(({ count }) => { if (count != null) setServiceCount(count); });
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'active').then(({ count }) => { if (count != null) setIncidentCount(count); });
  }, []);

  // Hard-deletes every crash_logs row with resolved=true plus every incidents
  // row with status='resolved' — both are what shows up as "resolved markers"
  // on the dashboard map. The dashboard listens for postgres_changes DELETE
  // events on both tables, so open dashboards drop the markers in realtime.
  async function handleClearResolved() {
    if (clearing) return;
    const supabase = createClient();

    // Preview counts first so the confirm dialog is honest about what gets dropped.
    const [crashRes, incRes] = await Promise.all([
      supabase.from('crash_logs').select('id', { count: 'exact', head: true }).eq('resolved', true),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
    ]);
    const crashN = crashRes.count ?? 0;
    const incN = incRes.count ?? 0;

    if (crashN === 0 && incN === 0) {
      setClearResult({ kind: 'ok', text: 'Nothing to clear — no resolved markers exist.' });
      return;
    }

    const ok = window.confirm(
      `Delete ${crashN} resolved crash${crashN === 1 ? '' : 'es'} and ${incN} resolved incident${incN === 1 ? '' : 's'}?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setClearing(true);
    setClearResult(null);
    try {
      const [crashDel, incDel] = await Promise.all([
        crashN > 0 ? supabase.from('crash_logs').delete().eq('resolved', true) : Promise.resolve({ error: null }),
        incN > 0 ? supabase.from('incidents').delete().eq('status', 'resolved') : Promise.resolve({ error: null }),
      ]);
      const err = (crashDel as { error?: { message: string } | null }).error ?? (incDel as { error?: { message: string } | null }).error;
      if (err) {
        setClearResult({ kind: 'err', text: `Failed: ${err.message}` });
        return;
      }
      // Refresh the active-incident counter — it changes when we delete resolved
      // incidents (since the count query filters on status='active', the number
      // itself doesn't move, but any rows that were active-then-flipped would).
      const { count } = await supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'active');
      if (count != null) setIncidentCount(count);
      setClearResult({ kind: 'ok', text: `Cleared ${crashN} crash${crashN === 1 ? '' : 'es'} and ${incN} incident${incN === 1 ? '' : 's'}.` });
    } catch (e) {
      setClearResult({ kind: 'err', text: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setClearing(false);
    }
  }

  const statuses = [
    { name: 'Database', status: 'Connected', ok: true },
    { name: 'Realtime', status: 'Online', ok: true },
    { name: 'Services', status: 'Active', ok: true },
  ];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <h1 style={{ fontSize: 13, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 4 }}>Admin</h1>
          <p style={{ fontSize: 28, fontWeight: 300, color: 'var(--text-primary)', letterSpacing: -0.5 }}>System Overview</p>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{elapsed}s ago</span>
      </div>

      {/* Hero numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--red)' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Active Incidents</p>
          <p style={{ fontSize: 56, fontWeight: 300, color: incidentCount > 0 ? 'var(--red)' : 'var(--text-primary)', lineHeight: 1, letterSpacing: -2 }}>{incidentCount}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--blue)' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Registered Services</p>
          <p style={{ fontSize: 56, fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: -2 }}>{serviceCount}</p>
        </motion.div>
      </div>

      {/* System Status */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em', marginBottom: 12 }}>System status</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {statuses.map((s, i) => (
            <motion.div key={s.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: i < statuses.length - 1 ? '0.5px solid var(--border)' : 'none' }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{s.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="animate-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: s.ok ? 'var(--green)' : 'var(--red)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: s.ok ? 'var(--green)' : 'var(--red)' }}>{s.status}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Management */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em', marginBottom: 12 }}>Management</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { href: '/en/admin/services', label: 'Emergency Services', desc: 'Add, edit, and manage registered services', meta: `${serviceCount} registered`, color: 'var(--blue)' },
            { href: '/en/dashboard', label: 'Incidents', desc: 'Live incident feed and response tracking', meta: `${incidentCount} active`, color: 'var(--red)' },
            { href: '/en/admin/crash-logs', label: 'Crash Logs', desc: 'Severity inspector — g-force, jerk, outcome', meta: 'View all', color: 'var(--amber)' },
          ].map(card => (
            <Link key={card.href} href={card.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', transition: 'all 0.15s', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
              >
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: card.color }} />
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{card.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{card.desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: card.color }}>{card.meta}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em', marginBottom: 12 }}>Quick actions</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Export incidents CSV', onClick: undefined, busyLabel: null },
            { label: 'Clear resolved', onClick: handleClearResolved, busyLabel: clearing ? 'Clearing…' : null },
            { label: 'Refresh services', onClick: undefined, busyLabel: null },
          ].map(btn => {
            const disabled = btn.onClick === undefined || (btn.label === 'Clear resolved' && clearing);
            const labelText = btn.busyLabel ?? btn.label;
            return (
              <button
                key={btn.label}
                onClick={btn.onClick}
                disabled={disabled}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 5, height: 34, padding: '0 14px',
                  cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                  background: 'transparent',
                  opacity: disabled && !btn.busyLabel ? 0.55 : 1,
                }}
                onMouseEnter={e => {
                  if (disabled) return;
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  if (disabled) return;
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >{labelText}</button>
            );
          })}
        </div>
        {clearResult && (
          <p style={{
            marginTop: 10,
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: clearResult.kind === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {clearResult.text}
          </p>
        )}
      </section>
    </div>
  );
}
