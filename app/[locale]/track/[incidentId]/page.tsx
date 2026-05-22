'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { createClient } from '@/lib/supabase/client';
import type { Responder } from '@/lib/types';
import { ArrowLeft, Clock, AlertCircle, Copy, Check, Loader2, CheckCircle2, RotateCcw, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';

const MapWithNoSSR = dynamic(() => import('@/components/ResponderMap'), { ssr: false });

interface RawIncident {
  id: string;
  user_name?: string;
  blood_group?: string;
  trigger_type?: string;
  location?: { coordinates: [number, number] } | null;
  address?: string;
  status?: string;
  sms_status?: any;
  created_at: string;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

export default function TrackPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const incidentId = params?.incidentId as string;
  const { t, language } = useLanguage();
  const [raw, setRaw] = useState<RawIncident | null>(null);
  const [responders, setResponders] = useState<Responder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  // Resolve state
  const [resolving, setResolving] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);

  async function fetchIncident() {
    const supabase = createClient();
    try {
      const { data, error: err } = await supabase.from('incidents').select('*').eq('id', incidentId).single();
      if (err) throw err;
      setRaw(data as RawIncident);
    } catch { setError(t('track.notFound')); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!incidentId) return;
    fetchIncident();
    const supabase = createClient();
    const channel = supabase.channel(`track-${incidentId}`)
      .on('broadcast', { event: 'location-update' }, (payload: any) => {
        setResponders(prev => {
          const idx = prev.findIndex(r => r.id === payload.responderId);
          if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], lat: payload.lat, lng: payload.lng, updatedAt: Date.now() }; return next; }
          return [...prev, { id: payload.responderId, name: payload.name || 'Responder', lat: payload.lat, lng: payload.lng, type: payload.responderType || 'ambulance', updatedAt: Date.now() }];
        });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [incidentId]);

  // Parse PostGIS location. Must run unconditionally — before any early
  // return below — or React throws error #310 (hook count changes between
  // the loading render and the loaded render).
  const mapCenter = useMemo<[number, number] | undefined>(() => {
    if (!raw?.location?.coordinates) return undefined;
    const [lng, lat] = raw.location.coordinates;
    return [lat, lng];
  }, [raw?.location]);

  async function handleResolve() {
    if (!raw) return;
    setResolving(true);
    const supabase = createClient();
    const { error: err } = await supabase.from('incidents').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_note: noteInput.trim() || null,
    }).eq('id', incidentId);
    if (!err) { setRaw(prev => prev ? { ...prev, status: 'resolved', resolved_at: new Date().toISOString(), resolution_note: noteInput.trim() || null } : prev); setShowNoteField(false); }
    setResolving(false);
  }

  async function handleReopen() {
    if (!raw) return;
    setResolving(true);
    const supabase = createClient();
    const { error: err } = await supabase.from('incidents').update({
      status: 'active',
      resolved_at: null,
      resolution_note: null,
    }).eq('id', incidentId);
    if (!err) { setRaw(prev => prev ? { ...prev, status: 'active', resolved_at: null, resolution_note: null } : prev); setNoteInput(''); }
    setResolving(false);
  }

  async function handleCopyLink() {
    try { await navigator.clipboard?.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13 }}>{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !raw) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <AlertCircle size={40} color="var(--red)" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{t('track.notFound')}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>{error}</p>
        <Link href={`/${locale}/dashboard`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--red)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600 }}>
          <ArrowLeft size={14} /> {t('common.goBack')}
        </Link>
      </div>
    );
  }

  const isActive = raw.status !== 'resolved';
  const statusLabel = isActive ? t('track.sosActive') : t('track.sosResolved');
  const statusColor = isActive ? 'var(--red)' : 'var(--green)';
  const timeStr = new Date(raw.created_at).toLocaleString(language === 'English' ? 'en-IN' : language);
  const shortId = incidentId?.slice(0, 8).toUpperCase() || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      {/* Back */}
      <Link href={`/${locale}/dashboard`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', width: 'fit-content' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <ArrowLeft size={13} /> Back to Dashboard
      </Link>

      {/* Status Banner */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: isActive ? 'color-mix(in srgb, var(--red) 6%, transparent)' : 'color-mix(in srgb, var(--green) 6%, transparent)',
        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--red) 25%, transparent)' : 'color-mix(in srgb, var(--green) 25%, transparent)'}`,
        borderRadius: 10, padding: '24px 28px',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: statusColor }} />
        <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: 80, fontWeight: 700, color: statusColor, opacity: 0.05, letterSpacing: -4, userSelect: 'none', pointerEvents: 'none', lineHeight: 1 }}>
          {isActive ? 'SOS' : 'OK'}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{ paddingTop: 6, flexShrink: 0 }}>
            <div className={isActive ? 'animate-pulse-dot' : ''} style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, boxShadow: isActive ? '0 0 0 3px color-mix(in srgb, var(--red) 20%, transparent)' : 'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: statusColor, letterSpacing: -0.5, lineHeight: 1, marginBottom: 8 }}>{statusLabel}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red)' }}>{shortId}</span>
              {raw.user_name && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{raw.user_name}</span>}
              {raw.blood_group && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 7px', borderRadius: 3, background: 'color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--red)' }}>
                  {raw.blood_group}
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                <Clock size={11} />{timeStr}
              </span>
            </div>
            {/* Resolution note display */}
            {!isActive && raw.resolution_note && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                Note: {raw.resolution_note}
              </p>
            )}
          </div>
          <button onClick={handleCopyLink} style={{
            flexShrink: 0, height: 32, padding: '0 14px',
            background: copied ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--border)',
            border: `1px solid ${copied ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border-mid)'}`,
            borderRadius: 6, color: copied ? 'var(--green)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* ─── Resolve / Reopen Section ─── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>Incident Management</p>

        {isActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {showNoteField && (
              <input
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Resolution note (optional)…"
                style={{
                  width: '100%', background: 'var(--bg)', border: '1px solid var(--border-mid)',
                  borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)',
                  fontSize: 13, outline: 'none',
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleResolve(); }}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { if (showNoteField) handleResolve(); else setShowNoteField(true); }}
                disabled={resolving}
                style={{
                  height: 34, padding: '0 16px', background: 'var(--green)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: 12, borderRadius: 6, cursor: resolving ? 'not-allowed' : 'pointer',
                  opacity: resolving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s',
                }}
              >
                <CheckCircle2 size={14} />
                {resolving ? 'Resolving…' : showNoteField ? 'Confirm Resolve' : 'Resolve Incident'}
              </button>
              {showNoteField && (
                <button onClick={() => setShowNoteField(false)} style={{ height: 34, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>
                Resolved {raw.resolved_at ? new Date(raw.resolved_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </p>
            </div>
            <button
              onClick={handleReopen}
              disabled={resolving}
              style={{
                height: 34, padding: '0 14px', border: '1px solid var(--border-mid)',
                borderRadius: 6, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12,
                cursor: resolving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                opacity: resolving ? 0.6 : 1, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <RotateCcw size={13} /> Re-open
            </button>
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ height: 420, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', background: 'var(--bg)' }} className="map-scanline">
        <MapWithNoSSR responders={responders} center={mapCenter} />
        {!mapCenter && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>No location data</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--green)' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>Responders</p>
          <p style={{ fontSize: 36, fontWeight: 300, color: 'var(--green)', lineHeight: 1, marginBottom: 4 }}>{responders.length}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Active nearby</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--blue)' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>SMS Status</p>
          {raw.sms_status && Array.isArray(raw.sms_status) && raw.sms_status.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {raw.sms_status.map((s: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.name || s.phone}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: s.sent ? 'var(--green)' : 'var(--red)' }}>
                    {s.sent ? 'Sent' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>No contacts notified</p>
          )}
        </div>
      </div>

      {/* ICE Card QR */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flexShrink: 0, background: '#fff', padding: 8, borderRadius: 6 }}>
          <QRCode
            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/ice/${incidentId}`}
            size={80}
            level="M"
          />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <QrCode size={14} color="var(--text-muted)" />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>ICE Card</p>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>Scan for emergency medical info</p>
          <a href={`/ice/${incidentId}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--blue)' }}>
            /ice/{shortId} →
          </a>
        </div>
      </div>
    </div>
  );
}
