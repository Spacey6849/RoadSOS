import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Activity, CheckCircle2, MapPin, ShieldX, TriangleAlert, XCircle } from 'lucide-react-native';
import { GhostButton, Header, IconBadge, LoadingState, Panel, Screen, StatusPill } from '../components/AppKit';
import { Colors, Spacing, Typography } from '../constants/theme';
import { cancelOwnCrashLog, getOwnCrashLogs, type CrashLogRow } from '../lib/crash-logger';
import { isSupabaseConfigured } from '../lib/supabase';

type Tone = 'red' | 'amber' | 'green' | 'neutral';

// Severity from peak G-force — mirrors the dashboard's classifier.
function severity(g: number | null): { label: string; tone: Tone } {
  const v = g ?? 0;
  if (v > 3) return { label: 'CRITICAL', tone: 'red' };
  if (v > 1.5) return { label: 'MODERATE', tone: 'amber' };
  return { label: 'MINOR', tone: 'neutral' };
}

function outcomeLabel(row: CrashLogRow): { label: string; tone: Tone } {
  if (row.outcome === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (row.outcome === 'false-alarm') return { label: 'False alarm', tone: 'neutral' };
  if (row.resolved) return { label: 'Resolved', tone: 'green' };
  if (row.outcome === 'sos_sent') return { label: 'SOS sent', tone: 'red' };
  return { label: 'Pending', tone: 'amber' };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CrashHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<CrashLogRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await getOwnCrashLogs();
    setRows(data);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh whenever the screen regains focus (e.g. after a crash fired).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function confirmCancel(row: CrashLogRow) {
    Alert.alert(
      'Cancel this crash alert?',
      'This marks the crash as a false alarm and removes it from the responder dashboard map. Use this if you are safe and forgot to dismiss it.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel alert',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(row.id);
            const ok = await cancelOwnCrashLog(row.id);
            setCancellingId(null);
            if (ok) {
              setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, outcome: 'cancelled', resolved: true } : r)));
            } else {
              Alert.alert('Could not cancel', 'Check your connection and try again.');
            }
          },
        },
      ],
    );
  }

  if (!loaded) {
    return <Screen style={{ paddingTop: insets.top }}><LoadingState label="Loading crash history…" /></Screen>;
  }

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <Header title="Crash History" subtitle="Your device's detected crashes" showBack />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl, gap: Spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.sosRed} />}
      >
        {!isSupabaseConfigured ? (
          <Panel tone="amber" style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
            <IconBadge Icon={TriangleAlert} tone="amber" />
            <Text style={{ color: Colors.textMuted, ...Typography.bodySmall, flex: 1 }}>
              Crash history needs an internet connection and Supabase configured.
            </Text>
          </Panel>
        ) : rows.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm }}>
            <IconBadge Icon={CheckCircle2} tone="green" size={64} />
            <Text style={{ color: Colors.textPrimary, ...Typography.h3, textAlign: 'center' }}>No crashes recorded</Text>
            <Text style={{ color: Colors.textMuted, ...Typography.bodySmall, textAlign: 'center' }}>
              Detected crashes from this device will appear here so you can review or cancel them.
            </Text>
          </Panel>
        ) : (
          rows.map((row) => {
            const sev = severity(row.g_force);
            const out = outcomeLabel(row);
            const canCancel = !row.resolved && row.outcome !== 'cancelled' && row.outcome !== 'false-alarm';
            const loc = row.address
              || (row.latitude != null && row.longitude != null ? `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}` : 'No location recorded');
            return (
              <Panel key={row.id} tone={sev.tone} style={{ gap: Spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <IconBadge Icon={row.resolved ? CheckCircle2 : Activity} tone={sev.tone} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                      {sev.label} crash
                    </Text>
                    <Text style={{ color: Colors.textMuted, ...Typography.caption }}>{formatTime(row.detected_at)}</Text>
                  </View>
                  <StatusPill label={out.label} tone={out.tone} />
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Peak force</Text>
                    <Text style={{ color: Colors.textPrimary, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                      {row.g_force != null ? `${row.g_force.toFixed(2)} g` : '—'} · jerk {row.jerk_gs != null ? `${row.jerk_gs.toFixed(1)} g/s` : '—'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={Colors.textFaint} />
                    <Text style={{ color: Colors.textMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>{loc}</Text>
                  </View>
                </View>

                {canCancel ? (
                  <GhostButton
                    label={cancellingId === row.id ? 'Cancelling…' : 'Cancel this alert'}
                    Icon={XCircle}
                    tone="red"
                    onPress={() => confirmCancel(row)}
                    style={{ minHeight: 40 }}
                  />
                ) : row.outcome === 'cancelled' || row.outcome === 'false-alarm' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 }}>
                    <ShieldX size={13} color={Colors.textFaint} />
                    <Text style={{ color: Colors.textFaint, fontSize: 12 }}>Removed from responder map</Text>
                  </View>
                ) : null}
              </Panel>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
