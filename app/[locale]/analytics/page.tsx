'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

interface Row { created_at: string; trigger_type: string }

const COLORS = { auto: '#FF9F0A', manual: '#0A84FF' };

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {label && <p style={{ color: '#71717A', marginBottom: 4 }}>{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color || '#f2f2f7' }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

/* Measures container width so we can pass exact px to charts */
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(500);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    setWidth(ref.current.offsetWidth);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export default function AnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const lineRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lineWidth = useContainerWidth(lineRef);
  const barWidth = useContainerWidth(barRef);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('incidents').select('created_at,trigger_type').order('created_at').then(({ data }) => {
      if (data) setRows(data as Row[]);
      setLoading(false);
    });
  }, []);

  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    const now = Date.now();
    rows.forEach(r => {
      const d = new Date(r.created_at);
      if (now - d.getTime() > 30 * 86400000) return;
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [rows]);

  const hourlyData = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, count: 0 }));
    rows.forEach(r => { arr[new Date(r.created_at).getHours()].count++; });
    return arr;
  }, [rows]);

  const triggerData = useMemo(() => {
    const auto = rows.filter(r => r.trigger_type === 'auto').length;
    const manual = rows.length - auto;
    return [{ name: 'Auto', value: auto }, { name: 'Manual', value: manual }];
  }, [rows]);

  const axisStyle = { fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#71717A' } as const;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 4 }}>Analytics</p>
        <h1 style={{ fontSize: 24, fontWeight: 300, color: 'var(--text-primary)', letterSpacing: -0.5 }}>Incident Analytics</h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rows.length} total incidents</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Daily line chart */}
          <div ref={lineRef} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 20px 12px', overflow: 'hidden' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>Incidents / Day (last 30 days)</p>
            {dailyData.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '40px 0' }}>No data in last 30 days</p>
            ) : (
              <LineChart width={lineWidth - 40} height={180} data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={axisStyle} interval="preserveStartEnd" />
                <YAxis tick={axisStyle} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="count" name="Incidents" stroke="#FF3B30" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </div>

          {/* Hourly bar chart */}
          <div ref={barRef} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 20px 12px', overflow: 'hidden' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>Incidents by Hour of Day</p>
            <BarChart width={barWidth - 40} height={180} data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="hour" tick={axisStyle} interval={3} />
              <YAxis tick={axisStyle} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Incidents" fill="#0A84FF" radius={[2, 2, 0, 0]} />
            </BarChart>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Donut */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12, alignSelf: 'flex-start' }}>Trigger Type</p>
            <PieChart width={180} height={180}>
              <Pie data={triggerData} cx={90} cy={90} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {triggerData.map((entry, i) => (
                  <Cell key={entry.name} fill={i === 0 ? COLORS.auto : COLORS.manual} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {triggerData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? COLORS.auto : COLORS.manual }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', gridColumn: '1/-1', marginBottom: 4 }}>Summary</p>
            {[
              { label: 'Total Incidents', value: rows.length, color: 'var(--text-primary)' },
              { label: 'Auto Detected', value: triggerData[0].value, color: COLORS.auto },
              { label: 'Manual SOS', value: triggerData[1].value, color: COLORS.manual },
              { label: 'Auto Rate', value: rows.length ? `${Math.round((triggerData[0].value / rows.length) * 100)}%` : '—', color: COLORS.auto },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>{s.label}</p>
                <p style={{ fontSize: 32, fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
