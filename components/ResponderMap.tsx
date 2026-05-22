'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Responder, Incident, CrashLog } from '@/lib/types';

/* Watches center prop and flies the map there — must be inside MapContainer */
function FlyToCenter({ center }: { center?: [number, number] }) {
  const map = useMap();
  const prev = useRef('');
  useEffect(() => {
    if (!center) return;
    const key = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    if (key === prev.current) return;
    prev.current = key;
    map.flyTo(center, 13, { duration: 1.5 });
  }, [center, map]);
  return null;
}

/* Handles invalidateSize on container resize */
function ResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(true), 150);
    const t2 = setTimeout(() => map.invalidateSize(true), 500);
    const ro = new ResizeObserver(() => map.invalidateSize(true));
    ro.observe(map.getContainer());
    const onResize = () => map.invalidateSize(true);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t1); clearTimeout(t2); ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [map]);
  return null;
}

/* Heatmap layer — dynamically imports leaflet.heat to avoid SSR issues */
function HeatLayer({ points }: { points: [number, number][] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    if (!points.length) return;
    let cancelled = false;
    import('leaflet.heat').then(mod => {
      if (cancelled) return;
      if (layerRef.current) map.removeLayer(layerRef.current);
      const fn = (mod as any).default ?? (mod as any);
      layerRef.current = fn(points, { radius: 25, blur: 20, maxZoom: 17, gradient: { 0.2: '#0A84FF', 0.5: '#FF9F0A', 1.0: '#FF3B30' } });
      layerRef.current!.addTo(map);
    });
    return () => {
      cancelled = true;
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    };
  }, [points, map]);
  return null;
}

/* Severity derived from peak G-force — mirrors the crash-logs admin table */
function crashSeverity(g: number): { label: string; color: string } {
  if (g > 3) return { label: 'CRITICAL', color: '#FF3B30' };
  if (g > 1.5) return { label: 'MODERATE', color: '#FF9F0A' };
  return { label: 'MINOR', color: 'var(--text-muted)' };
}

/* One label/value line inside the crash popup */
function CrashRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

/* Popup card for a crash marker — details + Google Maps link + resolve action */
function CrashPopupBody({ crash, onResolveCrash }: { crash: CrashLog; onResolveCrash?: (id: string) => void }) {
  const [resolving, setResolving] = useState(false);
  const sev = crashSeverity(crash.gForce);
  const time = new Date(crash.detectedAt).toLocaleString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const mapsUrl = crash.location
    ? `https://www.google.com/maps/search/?api=1&query=${crash.location.lat},${crash.location.lng}`
    : undefined;

  const handleResolve = () => {
    if (!onResolveCrash || resolving) return;
    setResolving(true);
    onResolveCrash(crash.id);
  };

  return (
    <div style={{ minWidth: 210, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: crash.resolved ? '#34C759' : '#FF3B30' }}>
          {crash.resolved ? '✓ CRASH RESOLVED' : '⚠ CRASH DETECTED'}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
          padding: '2px 6px', borderRadius: 3, color: sev.color,
          border: `1px solid ${sev.color}`,
        }}>{sev.label}</span>
      </div>

      {/* Data rows */}
      <div style={{ fontSize: 11, borderTop: '1px solid var(--map-popup-border)', paddingTop: 5 }}>
        <CrashRow label="G-Force" value={`${crash.gForce.toFixed(2)} g`} />
        <CrashRow label="Jerk" value={`${crash.jerkGs.toFixed(1)} g/s`} />
        {crash.mode && <CrashRow label="Mode" value={crash.mode} />}
        <CrashRow label="Outcome" value={crash.outcome ?? 'pending'} />
      </div>

      {/* Detected time + address */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        Detected {time}
        {crash.location && (
          <span style={{ marginLeft: 6 }}>
            {crash.location.lat.toFixed(4)}, {crash.location.lng.toFixed(4)}
          </span>
        )}
      </div>
      {crash.address && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{crash.address}</div>
      )}

      {/* Status line */}
      <div style={{ fontSize: 11, fontWeight: 600, color: crash.resolved ? '#34C759' : '#FF3B30', marginTop: 8 }}>
        {crash.resolved ? 'Cleared by responder' : 'Awaiting responder action'}
      </div>

      {/* Open in Google Maps */}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'block', textAlign: 'center', marginTop: 8,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: '#0A84FF',
            border: '1px solid var(--map-popup-border)', borderRadius: 5, padding: '6px 0',
            textDecoration: 'none',
          }}
        >⤴ Open in Google Maps</a>
      )}

      {/* Resolve action */}
      {!crash.resolved && (
        <button onClick={handleResolve} disabled={resolving}
          style={{
            width: '100%', marginTop: 6, padding: '6px 0', borderRadius: 5,
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            background: resolving ? 'var(--text-muted)' : '#34C759',
            color: '#fff', border: 'none', cursor: resolving ? 'default' : 'pointer',
          }}
        >{resolving ? 'Resolving…' : '✓ Mark Resolved'}</button>
      )}
    </div>
  );
}

export default function ResponderMap({
  responders,
  incidents = [],
  crashLogs = [],
  center,
  userLocation,
  showMarkers = true,
  showCrashes = true,
  heatPoints = [],
  showHeat = false,
  onResolveCrash,
}: {
  responders: Responder[];
  incidents?: Incident[];
  crashLogs?: CrashLog[];
  center?: [number, number];
  userLocation?: [number, number];
  showMarkers?: boolean;
  showCrashes?: boolean;
  heatPoints?: [number, number][];
  showHeat?: boolean;
  onResolveCrash?: (id: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setReady(true);
    setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  if (!ready) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: '#0A84FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>Loading map…</p>
        </div>
      </div>
    );
  }

  // Icons created here — AFTER ready=true, guaranteed client-side only
  const incidentIcon = L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;background:#FF3B30;border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(255,59,48,0.25);"></div>',
    iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -10],
  });

  const userIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#0A84FF;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(10,132,255,0.25);"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10],
  });

  // Crash markers — red with an expanding wave while active, static green once resolved
  const crashIconActive = L.divIcon({
    className: '',
    html: '<div class="crash-marker-inner"><span class="crash-wave"></span><span class="crash-wave crash-wave-2"></span><span class="crash-core crash-core-active"></span></div>',
    iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12],
  });

  const crashIconResolved = L.divIcon({
    className: '',
    html: '<div class="crash-marker-inner"><span class="crash-core crash-core-resolved"></span></div>',
    iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12],
  });

  const responderIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41">' +
      '<path fill="#5E5CE6" d="M12.5 0C5.6 0 0 5.6 0 12.5C0 20.4 12.5 41 12.5 41S25 20.4 25 12.5C25 5.6 19.4 0 12.5 0z"/>' +
      '<circle fill="#fff" cx="12.5" cy="12.5" r="6"/>' +
      '</svg>'
    ),
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  });

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const crashWithLoc = crashLogs.find(c => c.location);
  const incidentWithLoc = incidents.find(i => i.location);
  const initialCenter: [number, number] =
    center ?? (incidentWithLoc?.location
      ? [incidentWithLoc.location.lat, incidentWithLoc.location.lng]
      : crashWithLoc?.location
        ? [crashWithLoc.location.lat, crashWithLoc.location.lng]
        : [20.5937, 78.9629]);
  const initialZoom = center ? 13 : (incidentWithLoc || crashWithLoc) ? 11 : 5;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 400, overflow: 'hidden', isolation: 'isolate' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        zoomSnap={1} zoomDelta={1}
        dragging scrollWheelZoom doubleClickZoom
        boxZoom={false} keyboard touchZoom
        zoomAnimation fadeAnimation={false} markerZoomAnimation={false}
        preferCanvas={false} zoomControl attributionControl
      >
        <ResizeHandler />
        <FlyToCenter center={center} />
        {showHeat && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

        <TileLayer
          key={tileUrl}
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={tileUrl}
          maxZoom={19}
          crossOrigin="anonymous"
          updateWhenIdle={false}
          updateWhenZooming={false}
          keepBuffer={4}
        />

        {userLocation && (
          <Marker position={userLocation} icon={userIcon}>
            <Popup>
              <div style={{ fontFamily: 'inherit', minWidth: 130 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#0A84FF', marginBottom: 3 }}>YOUR LOCATION</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{userLocation[0].toFixed(5)}, {userLocation[1].toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {showCrashes && crashLogs.filter(c => c.location).map(crash => (
          <Marker
            key={`crash-${crash.id}`}
            position={[crash.location!.lat, crash.location!.lng]}
            icon={crash.resolved ? crashIconResolved : crashIconActive}
            zIndexOffset={crash.resolved ? 0 : 1000}
          >
            <Popup>
              <CrashPopupBody crash={crash} onResolveCrash={onResolveCrash} />
            </Popup>
          </Marker>
        ))}

        {showMarkers && incidents.filter(i => i.location).map(inc => (
          <Marker key={inc.id} position={[inc.location!.lat, inc.location!.lng]} icon={incidentIcon}>
            <Popup>
              <div style={{ minWidth: 160, fontFamily: 'inherit' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#FF3B30', marginBottom: 4 }}>
                  {inc.id.slice(0, 8).toUpperCase()}
                </div>
                {inc.user_name && <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>{inc.user_name}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {new Date(inc.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  {inc.location && <span style={{ marginLeft: 6 }}>{inc.location.lat.toFixed(4)}, {inc.location.lng.toFixed(4)}</span>}
                </div>
                <a href={`/en/track/${inc.id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#0A84FF' }}>View →</a>
              </div>
            </Popup>
          </Marker>
        ))}

        {showMarkers && responders.map(r => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={responderIcon}>
            <Popup>
              <div style={{ minWidth: 120 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.name}</strong>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>{r.type} responder</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
