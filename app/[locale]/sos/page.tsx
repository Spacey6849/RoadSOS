'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MapPin, Phone, User, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'form' | 'sending' | 'done' | 'error';

export default function SOSPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locStatus, setLocStatus] = useState<'pending' | 'ok' | 'denied'>('pending');
  const [step, setStep] = useState<Step>('form');
  const [incidentId, setIncidentId] = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) { setLocStatus('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocStatus('ok'); },
      () => setLocStatus('denied')
    );
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setStep('sending');
    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), lat, lng }),
      });
      // The endpoint always returns JSON, but a 5xx HTML error page would
      // crash response.json() — fall back to status text in that case so the
      // user sees something useful instead of "Unexpected token < in JSON".
      let data: { id?: string; error?: string } = {};
      try { data = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) throw new Error(data.error || `Failed (HTTP ${res.status})`);
      if (!data.id) throw new Error('Server did not return an incident id');
      setIncidentId(data.id);
      setStep('done');
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }

  // Done state
  if (step === 'done') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <CheckCircle2 size={56} color="var(--green)" style={{ margin: '0 auto 20px' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>SOS Sent</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Emergency services have been notified. Stay calm and stay where you are.</p>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Incident ID</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--red)' }}>{incidentId.slice(0, 8).toUpperCase()}</p>
          </div>
          <Link href={`/${locale}/track/${incidentId}`} style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--blue)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600 }}>
            Track this incident →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} color="var(--red)" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5, marginBottom: 6 }}>
            Road<span style={{ color: 'var(--red)' }}>SoS</span> Emergency
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Send an emergency alert without the app</p>
        </div>

        {/* Location status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: locStatus === 'ok' ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'color-mix(in srgb, var(--amber) 8%, transparent)',
          border: `1px solid ${locStatus === 'ok' ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'color-mix(in srgb, var(--amber) 25%, transparent)'}`,
          borderRadius: 6, marginBottom: 20, fontSize: 12,
        }}>
          <MapPin size={14} color={locStatus === 'ok' ? 'var(--green)' : 'var(--amber)'} />
          <span style={{ color: locStatus === 'ok' ? 'var(--green)' : 'var(--amber)' }}>
            {locStatus === 'pending' ? 'Requesting location…' : locStatus === 'ok' ? `Location acquired (${lat?.toFixed(4)}, ${lng?.toFixed(4)})` : 'Location unavailable — SOS will still be sent'}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name"
              required
              style={{ width: '100%', height: 46, paddingLeft: 38, paddingRight: 12, background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--red)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <Phone size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Phone number"
              type="tel" required
              style={{ width: '100%', height: 46, paddingLeft: 38, paddingRight: 12, background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--red)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            />
          </div>

          {step === 'error' && (
            <p style={{ fontSize: 12, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={step === 'sending' || !name.trim() || !phone.trim()}
            style={{
              height: 52, background: 'var(--red)', color: '#fff', borderRadius: 8,
              fontSize: 16, fontWeight: 700, cursor: step === 'sending' ? 'not-allowed' : 'pointer',
              opacity: step === 'sending' ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.15s', letterSpacing: 0.3,
            }}
          >
            {step === 'sending' ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Sending SOS…</>
            ) : (
              <><AlertTriangle size={18} /> Send Emergency SOS</>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', marginTop: 16, fontFamily: 'var(--font-mono)' }}>
          For life-threatening emergencies, also call 112
        </p>
      </div>
    </div>
  );
}
