'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { Shield, MapPin, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

const MapWithNoSSR = dynamic(() => import('@/components/ResponderMap'), { ssr: false });

interface FamilyStatus {
  userName: string;
  status: 'safe' | 'active';
  incidentId?: string;
  lat?: number;
  lng?: number;
  updatedAt?: string;
}

export default function FamilyTrackPage() {
  const params = useParams();
  const code = ((params?.code as string) || '').toUpperCase();
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) return;
    const supabase = createClient();
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      // Look up the family link
      const { data: link } = await supabase
        .from('family_links')
        .select('user_id, expires_at')
        .eq('code', code)
        .single();

      if (!link) { setNotFound(true); setLoading(false); return; }

      // Check expiry
      if (new Date(link.expires_at) < new Date()) { setNotFound(true); setLoading(false); return; }

      userId = link.user_id;

      // Get most recent incident for this user
      const { data: incident } = await supabase
        .from('incidents')
        .select('id,user_name,status,location,created_at')
        .eq('user_id', link.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!incident) {
        setStatus({ userName: 'Driver', status: 'safe' });
      } else {
        let lat: number | undefined, lng: number | undefined;
        if (incident.location?.coordinates) {
          [lng, lat] = incident.location.coordinates;
        }
        setStatus({
          userName: incident.user_name || 'Driver',
          status: incident.status === 'resolved' ? 'safe' : 'active',
          incidentId: incident.id,
          lat, lng,
          updatedAt: incident.created_at,
        });
      }
      setLoading(false);

      // Realtime: subscribe ONLY to changes for THIS user_id. Subscribing
      // here (after the link is resolved) lets us pass a server-side filter
      // and avoids waking the page on every unrelated incident in the DB.
      if (userId && !channel) {
        channel = supabase.channel(`family-${code}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'incidents', filter: `user_id=eq.${userId}` },
            () => load(),
          )
          .subscribe();
      }
    }

    load();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [code]);

  const mapCenter = status?.lat && status?.lng ? [status.lat, status.lng] as [number, number] : undefined;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <AlertTriangle size={40} color="var(--amber)" style={{ margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Link not found</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>This tracking code is invalid or has expired. Ask the driver to share a new link.</p>
        </div>
      </div>
    );
  }

  const isSafe = status?.status === 'safe';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          Road<span style={{ color: 'var(--red)' }}>SoS</span> · Family Tracking
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3 }}>
          {status?.userName}
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>CODE: {code}</p>
      </div>

      {/* Status card */}
      <div style={{
        background: isSafe ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'color-mix(in srgb, var(--red) 8%, transparent)',
        border: `1px solid ${isSafe ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'color-mix(in srgb, var(--red) 25%, transparent)'}`,
        borderRadius: 12, padding: '24px', textAlign: 'center', marginBottom: 20,
      }}>
        {isSafe ? (
          <CheckCircle2 size={48} color="var(--green)" style={{ margin: '0 auto 12px' }} />
        ) : (
          <div className="animate-pulse-dot" style={{ width: 48, height: 48, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 20%, transparent)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={24} color="var(--red)" />
          </div>
        )}
        <h2 style={{ fontSize: 24, fontWeight: 700, color: isSafe ? 'var(--green)' : 'var(--red)', marginBottom: 6 }}>
          {isSafe ? 'Safe' : 'Active Incident'}
        </h2>
        {status?.updatedAt && (
          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            <Clock size={11} />
            {new Date(status.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        {!isSafe && status?.incidentId && (
          <a href={`/en/track/${status.incidentId}`} style={{ display: 'inline-block', marginTop: 12, padding: '8px 20px', background: 'var(--red)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600 }}>
            View Incident →
          </a>
        )}
      </div>

      {/* Map */}
      {mapCenter ? (
        <div style={{ height: 300, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }} className="map-scanline">
          <MapWithNoSSR center={mapCenter} responders={[]} />
        </div>
      ) : (
        <div style={{ height: 120, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <MapPin size={16} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>No location data</span>
        </div>
      )}

      <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 16 }}>
        Updates automatically · RoadSoS Emergency Platform
      </p>
    </div>
  );
}
