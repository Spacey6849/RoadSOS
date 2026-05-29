'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { createClient } from '@/lib/supabase/client';
import type { NearbyService, ServiceType } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/lib/useIsMobile';

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

export default function ServicesPage() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [services, setServices] = useState<NearbyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', service_type: 'hospital' as ServiceType, primary_phone: '', address: '', lat: '', lng: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const loadServices = useCallback(() => {
    const supabase = createClient();
    setLoading(true);
    supabase.from('services').select('*').limit(50).then(({ data }) => {
      if (data) setServices((data as ServiceRow[]).map((s) => ({
        id: s.id, name: s.name, service_type: s.service_type,
        address: s.address || '', primary_phone: s.primary_phone || '',
        is_24x7: s.is_24x7 || false, tags: s.tags || {}, distance_km: 0,
        lat: s.location?.coordinates?.[1] || 0, lng: s.location?.coordinates?.[0] || 0,
      })));
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadServices(); }, [loadServices]);
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
      loadServices();
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
    loadServices();
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
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{services.length} registered</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm({ name: '', service_type: 'hospital', primary_phone: '', address: '', lat: '', lng: '' }); setPanelOpen(true); }}
          style={{ height: 36, padding: '0 16px', background: 'var(--red)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: 'pointer', transition: 'opacity 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >+ Add Service</button>
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
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>No services registered</p>
          <button onClick={() => setPanelOpen(true)} style={{ height: 36, padding: '0 16px', background: 'var(--red)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, borderRadius: 6, cursor: 'pointer' }}>+ Add Service</button>
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
    </div>
  );
}
