'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { createClient } from '@/lib/supabase/client';
import type { Incident, Responder, CrashLog } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

const MapWithNoSSR = dynamic(() => import('@/components/ResponderMap'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%', background: 'var(--bg)' }} />,
});

/* ─── Animated Number ─── */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const end = value;
    if (start === end) return;
    const duration = 600;
    const t0 = performance.now();
    let raf: number;
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(Math.round(start + (end - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display}</>;
}

/* ─── Stat Card ─── */
function StatCard({ label, value, color, delay }: { label: string; value: number | string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', position: 'relative', overflow: 'hidden', minWidth: 0 }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: color }} />
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </p>
    </motion.div>
  );
}

/* ─── Incident Row ─── */
function IncidentRow({ incident, isNew, isFirst }: { incident: Incident; isNew: boolean; isFirst: boolean }) {
  const isAuto = incident.triggerType === 'auto';
  const isResolved = incident.status === 'resolved';
  const shortId = incident.id.slice(0, 8).toUpperCase();
  const time = new Date(incident.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const borderColor = isAuto ? 'var(--amber)' : 'var(--blue)';
  const firstBg = 'rgba(var(--red-rgb, 255,59,48), 0.04)';

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px 10px 14px',
        borderBottom: '0.5px solid var(--border)',
        borderLeft: `2px solid ${borderColor}`,
        cursor: 'default', position: 'relative',
        background: isFirst ? 'color-mix(in srgb, var(--red) 5%, transparent)' : 'transparent',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isFirst ? 'color-mix(in srgb, var(--red) 5%, transparent)' : 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)', flexShrink: 0 }}>{shortId}</span>
          {incident.user_name && <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{incident.user_name}</span>}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{time}</span>
      </div>

      {isResolved && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 2, background: 'color-mix(in srgb, var(--green) 12%, transparent)', color: 'var(--green)', whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>
          Resolved
        </span>
      )}

      <a href={`/en/track/${incident.id}`}
        style={{ marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >View →</a>
    </motion.div>
  );
}

/* ─── Main Dashboard ─── */
export default function DashboardPage() {
  const { t } = useLanguage();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [responders, setResponders] = useState<Responder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'auto' | 'manual'>('all');
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [accentFlash, setAccentFlash] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [heatPoints, setHeatPoints] = useState<[number, number][]>([]);
  const [crashLogs, setCrashLogs] = useState<CrashLog[]>([]);
  const [showCrashes, setShowCrashes] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const responderChannelRef = useRef<any>(null);
  const crashChannelRef = useRef<any>(null);
  const supabaseRef = useRef<any>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;

    async function init() {
      try {
        const { data } = await supabase.from('incidents').select('*').order('created_at', { ascending: false }).limit(20);
        if (data) {
          const mapped = data.map(mapIncident);
          mapped.forEach(i => seenIds.current.add(i.id));
          setIncidents(mapped);
        }
      } catch {} finally { setLoading(false); }

      try {
        const { data: crashData } = await supabase
          .from('crash_logs')
          .select('id,detected_at,device_platform,mode,sensitivity,g_force,jerk_gs,latitude,longitude,address,outcome,resolved,resolved_at')
          .order('detected_at', { ascending: false })
          .limit(50);
        if (crashData) setCrashLogs(crashData.map(mapCrashLog));
      } catch {}

      channelRef.current = supabase.channel('incidents-web')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidents' }, (payload: any) => {
          const inc = mapIncident(payload.new);
          setIncidents(prev => [inc, ...prev].slice(0, 20));
          setAccentFlash(true);
          setTimeout(() => setAccentFlash(false), 2000);
        }).subscribe();

      // Must chain .on() BEFORE .subscribe()
      responderChannelRef.current = supabase.channel('responder-locations-web')
        .on('broadcast', { event: 'location-update' }, (payload: any) => {
          setResponders(prev => {
            const idx = prev.findIndex(r => r.id === payload.responderId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], lat: payload.lat, lng: payload.lng, updatedAt: Date.now() };
              return next;
            }
            return [...prev, { id: payload.responderId, name: payload.name || 'Responder', lat: payload.lat, lng: payload.lng, type: payload.responderType || 'ambulance', updatedAt: Date.now() }];
          });
        }).subscribe();

      // Crash logs — live INSERT (new crash) + UPDATE (resolve flips marker green)
      crashChannelRef.current = supabase.channel('crash-logs-web')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crash_logs' }, (payload: any) => {
          const c = mapCrashLog(payload.new);
          setCrashLogs(prev => [c, ...prev.filter(x => x.id !== c.id)].slice(0, 50));
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crash_logs' }, (payload: any) => {
          const c = mapCrashLog(payload.new);
          setCrashLogs(prev => prev.map(x => (x.id === c.id ? c : x)));
        }).subscribe();
    }
    init();
    return () => {
      if (channelRef.current) supabaseRef.current?.removeChannel(channelRef.current);
      if (responderChannelRef.current) supabaseRef.current?.removeChannel(responderChannelRef.current);
      if (crashChannelRef.current) supabaseRef.current?.removeChannel(crashChannelRef.current);
    };
  }, []);

  // Fetch all incident locations for heatmap when toggled on
  useEffect(() => {
    if (!showHeat || heatPoints.length > 0) return;
    const supabase = createClient();
    supabase.from('incidents').select('location').then(({ data }) => {
      if (!data) return;
      const pts: [number, number][] = [];
      data.forEach((row: any) => {
        if (row.location?.coordinates) {
          const [lng, lat] = row.location.coordinates;
          if (lat && lng) pts.push([lat, lng]);
        }
      });
      setHeatPoints(pts);
    });
  }, [showHeat]);

  function mapIncident(raw: any): Incident {
    // Try flat lat/lng columns first, then PostGIS geometry {coordinates:[lng,lat]}
    let location: Incident['location'] = undefined;
    if (raw.lat && raw.lng) {
      location = { lat: Number(raw.lat), lng: Number(raw.lng), timestamp: Date.now() };
    } else if (raw.location?.coordinates) {
      // PostGIS returns [lng, lat]
      const [lng, lat] = raw.location.coordinates;
      if (lat && lng) location = { lat: Number(lat), lng: Number(lng), timestamp: Date.now() };
    }
    return {
      id: raw.id, triggerType: raw.trigger_type || 'manual',
      createdAt: new Date(raw.created_at).getTime(),
      location,
      services: [], smsStatuses: [],
      user_name: raw.user_name, blood_group: raw.blood_group, status: raw.status,
    };
  }

  function mapCrashLog(raw: any): CrashLog {
    const lat = raw.latitude != null ? Number(raw.latitude) : null;
    const lng = raw.longitude != null ? Number(raw.longitude) : null;
    return {
      id: raw.id,
      detectedAt: new Date(raw.detected_at).getTime(),
      devicePlatform: raw.device_platform || '',
      mode: raw.mode || '',
      sensitivity: raw.sensitivity || '',
      gForce: Number(raw.g_force ?? 0),
      jerkGs: Number(raw.jerk_gs ?? 0),
      location: lat != null && lng != null ? { lat, lng } : undefined,
      address: raw.address || undefined,
      outcome: raw.outcome || undefined,
      resolved: !!raw.resolved,
      resolvedAt: raw.resolved_at ? new Date(raw.resolved_at).getTime() : undefined,
    };
  }

  // Optimistic resolve — flip the marker green now, sync to Supabase fire-and-forget
  const handleResolveCrash = useCallback(async (id: string) => {
    setCrashLogs(prev => prev.map(c => (c.id === id ? { ...c, resolved: true, resolvedAt: Date.now() } : c)));
    try {
      await supabaseRef.current
        ?.from('crash_logs')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
    } catch {}
  }, []);

  const filtered = useMemo(() => incidents.filter(i => filter === 'all' || i.triggerType === filter), [incidents, filter]);
  const activeCount = useMemo(() => incidents.filter(i => i.status !== 'resolved').length, [incidents]);
  const resolvedCount = useMemo(() => incidents.filter(i => i.status === 'resolved').length, [incidents]);
  const unresolvedCrashes = useMemo(() => crashLogs.filter(c => !c.resolved).length, [crashLogs]);

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'auto', label: 'Auto' }, { key: 'manual', label: 'Manual' },
  ];

  const mapCenter = useMemo<[number, number] | undefined>(() => {
    if (userLocation) return userLocation;
    const inc = incidents.find(i => i.location);
    if (inc?.location) return [inc.location.lat, inc.location.lng];
    return undefined;
  }, [userLocation, incidents]);

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', overflow: 'hidden' }}>

      {/* ─── LEFT: Incident Feed ─── */}
      <div style={{ width: 340, minWidth: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Red left-edge accent */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
          background: 'var(--red)',
          opacity: accentFlash ? 1 : 0.18,
          transition: accentFlash ? 'opacity 0s' : 'opacity 2s ease-out',
          zIndex: 1,
        }} />

        {/* Feed header */}
        <div style={{ padding: '16px 16px 12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 2 }}>Active Incidents</p>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: 72, fontWeight: 300, color: activeCount > 0 ? 'var(--red)' : 'var(--text-primary)', lineHeight: 1, letterSpacing: -4 }}>
              <AnimatedNumber value={activeCount} />
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {filters.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: filter === f.key ? 'var(--text-primary)' : 'var(--text-muted)',
                paddingBottom: 4,
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: filter === f.key ? '1px solid var(--text-primary)' : '1px solid transparent',
                background: 'none', cursor: 'pointer',
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feed list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
              <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '48px 16px' }}>No incidents</p>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((inc, idx) => (
                <IncidentRow key={inc.id} incident={inc} isNew={!seenIds.current.has(inc.id)} isFirst={idx === 0} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ─── RIGHT: Stats + Map ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '10px 12px', flexShrink: 0 }}>
          <StatCard label="Active" value={activeCount} color="var(--red)" delay={0} />
          <StatCard label="SOS Alerts" value={incidents.length} color="var(--blue)" delay={0.05} />
          <StatCard label="Responders" value={responders.length} color="var(--green)" delay={0.1} />
          <StatCard label="Resolved" value={`${incidents.length > 0 ? Math.round((resolvedCount / incidents.length) * 100) : 0}%`} color="var(--purple)" delay={0.15} />
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }} className="map-scanline">
          {/* Map controls — top right */}
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowHeat(h => !h)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '5px 10px', borderRadius: 4,
                background: showHeat ? 'var(--amber)' : 'var(--surface)',
                color: showHeat ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border-mid)', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {showHeat ? '🔥 Heatmap' : '○ Heatmap'}
            </button>
            <button
              onClick={() => setShowMarkers(m => !m)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '5px 10px', borderRadius: 4,
                background: showMarkers ? 'var(--red)' : 'var(--surface)',
                color: showMarkers ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-mid)', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {showMarkers ? '● Landmarks' : '○ Landmarks'}
            </button>
            <button
              onClick={() => setShowCrashes(c => !c)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '5px 10px', borderRadius: 4,
                background: showCrashes ? 'var(--red)' : 'var(--surface)',
                color: showCrashes ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-mid)', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {showCrashes ? `⚠ Crashes ${unresolvedCrashes}` : '○ Crashes'}
            </button>
          </div>
          <MapWithNoSSR
            responders={responders}
            incidents={incidents}
            crashLogs={crashLogs}
            center={mapCenter}
            userLocation={userLocation}
            showMarkers={showMarkers}
            showCrashes={showCrashes}
            heatPoints={heatPoints}
            showHeat={showHeat}
            onResolveCrash={handleResolveCrash}
          />
          {/* Show info when no incidents have location data */}
          {showMarkers && incidents.length > 0 && incidents.filter(i => i.location).length === 0 && (
            <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, pointerEvents: 'none', background: 'rgba(17,17,17,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#71717A', whiteSpace: 'nowrap' }}>
              No GPS data — incidents exist but location not yet recorded
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
