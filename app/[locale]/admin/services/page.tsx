'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { createClient } from '@/lib/supabase/client';
import type { NearbyService, ServiceType } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/lib/useIsMobile';
import { INDIA_CITIES, type CityPreset } from '@/lib/overpass';
import { importOsmArea, loadExistingKeys } from '@/lib/osm-import';

const SERVICE_TYPES: ServiceType[] = ['hospital', 'trauma_centre', 'ambulance', 'police', 'towing', 'puncture', 'showroom'];

// These stay as fixed hex — they're semantic type colors, not theme colors
const TYPE_COLORS: Record<ServiceType, string> = {
  hospital: '#0A84FF', trauma_centre: '#FF3B30', ambulance: '#FF9F0A',
  police: '#5E5CE6', towing: '#FF6B00', puncture: '#8B8000', showroom: '#71717A',
};

// Shape we get back from Supabase `services` (matches the SQL schema, with
// location as PostGIS geography rendered as GeoJSON).
type ServiceRow = {
  id: string;
  name: string;
  service_type: ServiceType;
  address?: string | null;
  primary_phone?: string | null;
  is_24x7?: boolean | null;
  tags?: Record<string, unknown> | null;
  location?: { coordinates?: [number, number] } | null;
};

// Length caps — prevent unbounded writes to the table.
const MAX_NAME = 120;
const MAX_ADDRESS = 240;
const MAX_PHONE = 24;

// Max rows rendered at once — the table can hold thousands after an OSM import,
// but the DOM only needs a recent slice; search reaches the rest.
const LIST_LIMIT = 300;

export default function ServicesPage() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [services, setServices] = useState<NearbyService[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', service_type: 'hospital' as ServiceType, primary_phone: '', address: '', lat: '', lng: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // OpenStreetMap import panel state
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cityIdx, setCityIdx] = useState(0);
  const [radiusKm, setRadiusKm] = useState('25');
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importDone, setImportDone] = useState<{ inserted: number; skipped: number } | null>(null);

  // We can hold 10k+ services after an OSM import, so the list never renders the
  // whole table — it shows the true total (exact count) in the header and a
  // capped, newest-first page of rows. Search narrows the page via a name/city
  // filter so any specific service is still reachable.
  const loadServices = useCallback((searchTerm = '') => {
    const supabase = createClient();
    setLoading(true);
    // Strip characters that have meaning in PostgREST's or() filter grammar
    // (commas separate conditions, parens group them) so a stray "," can't
    // break the query.
    const term = searchTerm.trim().replace(/[(),*]/g, ' ').replace(/\s+/g, ' ').trim();

    let countQuery = supabase.from('services').select('id', { count: 'exact', head: true });
    let rowsQuery = supabase.from('services').select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT);
    if (term) {
      const filter = `name.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%`;
      countQuery = countQuery.or(filter);
      rowsQuery = rowsQuery.or(filter);
    }

    Promise.all([countQuery, rowsQuery]).then(([countRes, rowsRes]) => {
      if (countRes.count != null) setTotalCount(countRes.count);
      const data = rowsRes.data;
      if (data) setServices((data as ServiceRow[]).map((s) => ({
        id: s.id, name: s.name, service_type: s.service_type,
        address: s.address || '', primary_phone: s.primary_phone || '',
        is_24x7: s.is_24x7 || false, tags: s.tags || {}, distance_km: 0,
        lat: s.location?.coordinates?.[1] || 0, lng: s.location?.coordinates?.[0] || 0,
      })));
      setLoading(false);
    });
  }, []);

  // Debounced search — reload the page whenever the query settles.
  useEffect(() => {
    const id = setTimeout(() => loadServices(search), 300);
    return () => clearTimeout(id);
  }, [search, loadServices]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const phone = form.primary_phone.trim();
    const address = form.address.trim();

    if (!name || !phone) { setFormError('Name and phone required.'); return; }
    if (name.length > MAX_NAME) { setFormError(`Name must be ≤ ${MAX_NAME} characters.`); return; }
    if (phone.length > MAX_PHONE) { setFormError(`Phone must be ≤ ${MAX_PHONE} characters.`); return; }
    if (address.length > MAX_ADDRESS) { setFormError(`Address must be ≤ ${MAX_ADDRESS} characters.`); return; }
    // Permissive phone shape — digits, +, spaces, dashes, parens. Allows
    // short emergency numbers (108, 112) AND international formats.
    if (!/^[0-9+\-\s()]{3,}$/.test(phone)) {
      setFormError('Phone must contain only digits, spaces, + - ( ) and be at least 3 characters.');
      return;
    }
    // lat/lng must parse as finite numbers in valid ranges, OR both empty
    // (a service with no coordinates is allowed — distance display skips it).
    let locationValue: string | undefined;
    if (form.lat.trim() || form.lng.trim()) {
      const lat = Number(form.lat);
      const lng = Number(form.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setFormError('Latitude and longitude must be numbers.');
        return;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setFormError('Latitude must be -90..90 and longitude -180..180.');
        return;
      }
      locationValue = `POINT(${lng} ${lat})`;
    }

    setFormError(''); setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = { name, service_type: form.service_type, primary_phone: phone, address };
    if (locationValue) payload.location = locationValue;
    try {
      if (editingId) { const { error } = await supabase.from('services').update(payload).eq('id', editingId); if (error) throw error; }
      else { const { error } = await supabase.from('services').insert(payload); if (error) throw error; }
      setPanelOpen(false); setEditingId(null);
      setForm({ name: '', service_type: 'hospital', primary_phone: '', address: '', lat: '', lng: '' });
      loadServices(search);
    } catch (err: unknown) { setFormError(err instanceof Error ? err.message : 'Save failed'); }
    setSaving(false);
  }

  function startEdit(svc: NearbyService) {
    setForm({ name: svc.name, service_type: svc.service_type, primary_phone: svc.primary_phone, address: svc.address, lat: String(svc.lat), lng: String(svc.lng) });
    setEditingId(svc.id); setPanelOpen(true);
  }

  async function handleDelete(svc: NearbyService) {
    // Native confirm — one-click delete on a destructive admin action is
    // exactly the kind of UI mistake that wipes a row by accident.
    if (!window.confirm(`Delete "${svc.name}"? This cannot be undone.`)) return;
    setDeleteError('');
    const supabase = createClient();
    const { error } = await supabase.from('services').delete().eq('id', svc.id);
    if (error) {
      setDeleteError(`Delete failed: ${error.message}`);
      return;
    }
    loadServices(search);
  }

  // ── OpenStreetMap import ────────────────────────────────────────────────
  // Pull real emergency services from OSM (Overpass) into the table. A single
  // all-India query is infeasible, so we import per-city; "Import all cities"
  // sweeps the curated INDIA_CITIES list sequentially (with a pause between
  // each to stay polite to the public Overpass mirrors).
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function runImport(cities: CityPreset[]) {
    if (importing) return;
    const radius = Math.min(Math.max(Number(radiusKm) || 25, 1), 60);
    setImporting(true);
    setImportLog([]);
    setImportDone(null);

    // One shared de-dupe snapshot for the whole sweep so overlapping city radii
    // don't re-insert the same POI twice.
    const existing = await loadExistingKeys();
    let totalInserted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if (!c) continue;
      setImportLog((prev) => [...prev, `↻ ${c.name} (${radius} km)…`]);
      const appendProgress = (msg: string) => setImportLog((prev) => [...prev, msg]);
      const res = await importOsmArea(c.lat, c.lng, radius, existing, appendProgress);
      if (res.error) {
        setImportLog((prev) => [...prev, `✗ ${c.name}: ${res.error}`]);
      } else {
        totalInserted += res.inserted;
        totalSkipped += res.skipped;
        setImportLog((prev) => [...prev, `✓ ${c.name}: +${res.inserted} new · ${res.skipped} already had`]);
      }
      // Pace the sweep so we don't trip the public Overpass rate limiter — a
      // heavy metro query needs the limiter to recover before the next city.
      if (i < cities.length - 1) await sleep(4000);
    }

    setImportDone({ inserted: totalInserted, skipped: totalSkipped });
    setImporting(false);
    loadServices(search);
  }

  function handleImportCity() {
    const c = INDIA_CITIES[cityIdx];
    if (c) runImport([c]);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid var(--border-mid)',
    padding: '8px 0', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase',
    color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 6,
  };

  return (
    <div style={{ padding: isMobile ? '16px 14px' : '24px 32px', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 4 }}>Admin / Services</p>
          <h1 style={{ fontSize: 24, fontWeight: 300, color: 'var(--text-primary)', letterSpacing: -0.5 }}>Emergency Services</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{totalCount.toLocaleString('en-IN')} registered</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => { setImportLog([]); setImportDone(null); setImportOpen(true); }}
            style={{ height: 36, padding: '0 14px', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13, border: '1px solid var(--border-mid)', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
          >↓ Import from OSM</button>
          <button
            onClick={() => { setEditingId(null); setForm({ name: '', service_type: 'hospital', primary_phone: '', address: '', lat: '', lng: '' }); setPanelOpen(true); }}
            style={{ height: 36, padding: '0 16px', background: 'var(--red)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >+ Add Service</button>
        </div>
      </div>

      {/* Search — the only way to reach a specific row once the table holds
          thousands of imported services (the list renders a capped page). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, address or city…"
          style={{
            flex: 1, minWidth: 200, height: 38, padding: '0 14px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />
        {!loading && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {totalCount > services.length
              ? `Showing ${services.length} of ${totalCount.toLocaleString('en-IN')}`
              : `${services.length} shown`}
          </span>
        )}
      </div>

      {deleteError && (
        <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{deleteError}</p>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : services.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            {search.trim() ? `No services match “${search.trim()}”` : 'No services registered'}
          </p>
          {!search.trim() && (
            <button onClick={() => setPanelOpen(true)} style={{ height: 36, padding: '0 16px', background: 'var(--red)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: 'pointer' }}>+ Add Service</button>
          )}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {services.map((svc, idx) => {
            const chipColor = TYPE_COLORS[svc.service_type] || '#71717A';
            const label = svc.service_type.replace('_', '\u00A0').toUpperCase();
            return (
              <div key={svc.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: isMobile ? '8px 12px' : '0 20px',
                  minHeight: 52,
                  borderBottom: idx < services.length - 1 ? '0.5px solid var(--border)' : 'none',
                  background: 'var(--surface)', transition: 'background 0.12s',
                  borderLeft: `2px solid ${chipColor}`,
                  gap: isMobile ? 8 : 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: isMobile ? 'auto' : 110, flexShrink: 0 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: chipColor, flexShrink: 0 }} />
                  {!isMobile && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: chipColor }}>{label}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</p>
                  {svc.address && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isMobile ? '100%' : 260 }}>{isMobile ? svc.primary_phone : svc.address}</p>}
                </div>
                {!isMobile && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginRight: 24, flexShrink: 0 }}>{svc.primary_phone}</span>
                )}
                {!isMobile && svc.is_24x7 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', borderRadius: 3, padding: '1px 5px', marginRight: 16, flexShrink: 0 }}>24×7</span>
                )}
                <div style={{ display: 'flex', gap: isMobile ? 8 : 14, flexShrink: 0 }}>
                  <button onClick={() => startEdit(svc)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >Edit</button>
                  <button onClick={() => handleDelete(svc)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'color-mix(in srgb, var(--red) 50%, transparent)', cursor: 'pointer', transition: 'color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'color-mix(in srgb, var(--red) 50%, transparent)'; }}
                  >Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Panel */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              initial={{ x: isMobile ? '100%' : 420 }} animate={{ x: 0 }} exit={{ x: isMobile ? '100%' : 420 }}
              transition={{ ease: [0.32, 0.72, 0, 1], duration: 0.3 }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: isMobile ? '100%' : 420,
                background: 'var(--surface)',
                borderLeft: isMobile ? 'none' : '1px solid var(--border)',
                zIndex: 50, display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{editingId ? 'Edit Service' : 'Add Service'}</h2>
                <button onClick={() => setPanelOpen(false)} style={{ fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSave} style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div><label style={labelStyle}>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>

                <div>
                  <label style={labelStyle}>Type</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {SERVICE_TYPES.map(st => (
                      <button key={st} type="button" onClick={() => setForm({ ...form, service_type: st })} style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', padding: '6px 10px', borderRadius: 3,
                        border: form.service_type === st ? `1px solid ${TYPE_COLORS[st]}` : '1px solid var(--border)',
                        background: form.service_type === st ? `${TYPE_COLORS[st]}20` : 'transparent',
                        color: form.service_type === st ? TYPE_COLORS[st] : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s',
                      }}>{st.replace('_', ' ')}</button>
                    ))}
                  </div>
                </div>

                <div><label style={labelStyle}>Phone</label><input value={form.primary_phone} onChange={e => setForm({ ...form, primary_phone: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={inputStyle} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div><label style={labelStyle}>Latitude</label><input value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Longitude</label><input value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} style={inputStyle} /></div>
                </div>

                {formError && <p style={{ fontSize: 12, color: 'var(--red)' }}>{formError}</p>}

                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                  <button type="submit" disabled={saving} style={{ width: '100%', height: 36, background: 'var(--red)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Service'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* OpenStreetMap import modal */}
      <AnimatePresence>
        {importOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }}
              onClick={() => { if (!importing) setImportOpen(false); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ ease: [0.32, 0.72, 0, 1], duration: 0.25 }}
              style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: isMobile ? '92vw' : 460, maxHeight: '85vh', overflow: 'auto',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                zIndex: 70, display: 'flex', flexDirection: 'column', padding: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>Import from OpenStreetMap</h2>
                <button onClick={() => { if (!importing) setImportOpen(false); }} disabled={importing}
                  style={{ fontSize: 18, color: 'var(--text-muted)', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.4 : 1 }}>✕</button>
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
                Pulls real hospitals, police, fire/rescue, ambulance, towing &amp; tyre shops from OpenStreetMap. India is too large for one query, so import a city at a time — or sweep every major city for national coverage. Duplicates are skipped automatically.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <select value={cityIdx} onChange={e => setCityIdx(Number(e.target.value))} disabled={importing}
                    style={{ ...inputStyle, cursor: importing ? 'not-allowed' : 'pointer' }}>
                    {INDIA_CITIES.map((c, i) => (
                      <option key={c.name} value={i} style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>{c.region} · {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Radius km</label>
                  <input value={radiusKm} onChange={e => setRadiusKm(e.target.value)} disabled={importing}
                    inputMode="numeric" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: importLog.length || importDone ? 16 : 0 }}>
                <button onClick={handleImportCity} disabled={importing}
                  style={{ flex: 1, height: 38, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                  {importing ? 'Importing…' : 'Import this city'}
                </button>
                <button onClick={() => runImport(INDIA_CITIES)} disabled={importing}
                  style={{ flex: 1, height: 38, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                  Import all {INDIA_CITIES.length} cities
                </button>
              </div>

              {(importLog.length > 0 || importDone) && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, maxHeight: 240, overflow: 'auto' }}>
                  {importLog.map((line, i) => (
                    <p key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: line.startsWith('✗') ? 'var(--red)' : line.startsWith('✓') ? 'var(--green)' : 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</p>
                  ))}
                  {importDone && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      Done — {importDone.inserted} added, {importDone.skipped} already present.
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
