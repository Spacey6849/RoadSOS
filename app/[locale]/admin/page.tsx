'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

// Shape of an incident row as it comes back from Supabase — enough fields to
// make the CSV export useful for offline analysis.
type IncidentExportRow = {
  id: string;
  created_at: string;
  trigger_type?: string | null;
  status?: string | null;
  user_name?: string | null;
  blood_group?: string | null;
  address?: string | null;
  location?: { coordinates?: [number, number] } | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
};

// RFC 4180 CSV escape — wrap in quotes when the value contains comma / quote /
// newline / carriage return, and double any embedded quotes.
function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function AdminPage() {
  const { t } = useLanguage();
  const [elapsed, setElapsed] = useState(0);
  const [serviceCount, setServiceCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Reusable so the Refresh Services quick action can call it too.
  async function refreshCounts(): Promise<{ services: number | null; incidents: number | null }> {
    const supabase = createClient();
    const [svcRes, incRes] = await Promise.all([
      supabase.from('services').select('id', { count: 'exact', head: true }),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    if (svcRes.count != null) setServiceCount(svcRes.count);
    if (incRes.count != null) setIncidentCount(incRes.count);
    return { services: svcRes.count ?? null, incidents: incRes.count ?? null };
  }

  useEffect(() => {
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Export every incident row as a CSV download. Uses a UTF-8 BOM so Excel
  // opens the file with the right encoding (without it, accented characters
  // in addresses render as mojibake).
  async function handleExportCSV() {
    if (exporting) return;
    setExporting(true);
    setExportResult(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('incidents')
        .select('id,created_at,trigger_type,status,user_name,blood_group,address,location,resolved_at,resolution_note')
        .order('created_at', { ascending: false })
        .limit(10_000);
      if (error) throw error;
      const rows = (data as IncidentExportRow[]) ?? [];
      if (rows.length === 0) {
        setExportResult({ kind: 'ok', text: 'No incidents to export.' });
        return;
      }
      const header = ['id', 'created_at', 'trigger_type', 'status', 'user_name', 'blood_group', 'address', 'latitude', 'longitude', 'resolved_at', 'resolution_note'];
      const lines = [header.join(',')];
      for (const r of rows) {
        const lng = r.location?.coordinates?.[0] ?? '';
        const lat = r.location?.coordinates?.[1] ?? '';
        lines.push([
          r.id,
          r.created_at,
          r.trigger_type ?? '',
          r.status ?? '',
          r.user_name ?? '',
          r.blood_group ?? '',
          r.address ?? '',
          lat,
          lng,
          r.resolved_at ?? '',
          r.resolution_note ?? '',
        ].map(csvEscape).join(','));
      }
      const csv = '﻿' + lines.join('\r\n'); // BOM + CRLF for Excel
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `roadsos-incidents-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after the click handler runs — synchronous revocation can race
      // the browser's "Save as" dialog on some platforms.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportResult({ kind: 'ok', text: `Exported ${rows.length} incident${rows.length === 1 ? '' : 's'}.` });
    } catch (e) {
      setExportResult({ kind: 'err', text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  async function handleRefreshServices() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const before = serviceCount;
      const { services } = await refreshCounts();
      if (services == null) {
        setRefreshResult({ kind: 'err', text: 'Could not refresh counts.' });
        return;
      }
      const delta = services - before;
      const deltaText = delta === 0 ? '' : delta > 0 ? ` (+${delta})` : ` (${delta})`;
      setRefreshResult({ kind: 'ok', text: `Refreshed · ${services} service${services === 1 ? '' : 's'}${deltaText}.` });
    } catch (e) {
      setRefreshResult({ kind: 'err', text: e instanceof Error ? e.message : 'Refresh failed' });
    } finally {
      setRefreshing(false);
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'export', label: 'Export incidents CSV', busyLabel: 'Exporting…', busy: exporting, onClick: handleExportCSV },
            { key: 'clear', label: 'Clear resolved', busyLabel: 'Clearing…', busy: clearing, onClick: handleClearResolved },
            { key: 'refresh', label: 'Refresh services', busyLabel: 'Refreshing…', busy: refreshing, onClick: handleRefreshServices },
          ].map(btn => {
            const disabled = btn.busy;
            const labelText = btn.busy ? btn.busyLabel : btn.label;
            return (
              <button
                key={btn.key}
                onClick={btn.onClick}
                disabled={disabled}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 5, height: 34, padding: '0 14px',
                  cursor: disabled ? 'wait' : 'pointer', transition: 'all 0.15s',
                  background: 'transparent',
                  opacity: disabled ? 0.7 : 1,
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
        {/* Result lines — one per action so users can see all three outcomes
            at once instead of the last action clobbering earlier feedback. */}
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {exportResult && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: exportResult.kind === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              Export: {exportResult.text}
            </p>
          )}
          {clearResult && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: clearResult.kind === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              Clear: {clearResult.text}
            </p>
          )}
          {refreshResult && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: refreshResult.kind === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              Refresh: {refreshResult.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
