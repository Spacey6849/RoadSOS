import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

// ─── Theme tokens (kept in-file to avoid coupling to expo-app) ───────────────
const COLORS = {
  background: '#07090D',
  surface: '#111720',
  surface2: '#18212D',
  border: 'rgba(226,236,255,0.10)',
  sosRed: '#E83F42',
  safeGreen: '#2EC27E',
  warningAmber: '#F6A723',
  indigo: '#7C6EF6',
  textPrimary: '#F7FAFC',
  textMuted: '#A8B3C5',
  textFaint: '#6F7A8C',
};

// ─── Supabase client (single instance for the realtime channel) ──────────────
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder'));

const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_KEY || 'placeholder-anon-key',
);

// ─── Constants ───────────────────────────────────────────────────────────────
const IDENTITY_KEY = 'roadsos.responder.identity';
const CHANNEL_NAME = 'responder-locations-web'; // matches web-app dashboard
const HEARTBEAT_MS = 8000;

type ResponderType = 'ambulance' | 'police' | 'fire';
type Identity = { id: string; name: string; type: ResponderType };

const TYPE_COLORS: Record<ResponderType, string> = {
  ambulance: COLORS.sosRed,
  police: COLORS.indigo,
  fire: COLORS.warningAmber,
};
const TYPE_LABELS: Record<ResponderType, string> = {
  ambulance: 'Ambulance',
  police: 'Police',
  fire: 'Fire',
};

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function ResponderHome() {
  const insets = useSafeAreaInsets();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [typeInput, setTypeInput] = useState<ResponderType>('ambulance');
  const [onDuty, setOnDuty] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastBroadcast, setLastBroadcast] = useState<number | null>(null);
  const [broadcastCount, setBroadcastCount] = useState(0);
  const [, setTick] = useState(0); // forces re-render for "Xs ago" label

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef<Location.LocationObject | null>(null);

  // Load saved identity once on mount.
  useEffect(() => {
    AsyncStorage.getItem(IDENTITY_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Identity;
          setIdentity(parsed);
          setNameInput(parsed.name);
          setTypeInput(parsed.type);
        } catch {
          // stored value is corrupt — ignore and let the user re-enter
        }
      })
      .catch(() => {});
  }, []);

  // 1Hz tick so the "Xs ago" label updates without re-broadcasting.
  useEffect(() => {
    if (!onDuty) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [onDuty]);

  // Ensure everything is torn down if the screen unmounts mid-shift.
  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      heartbeatRef.current && clearInterval(heartbeatRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  function broadcast(coords: Location.LocationObjectCoords, ident: Identity) {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({
      type: 'broadcast',
      event: 'location-update',
      payload: {
        responderId: ident.id,
        name: ident.name,
        lat: coords.latitude,
        lng: coords.longitude,
        responderType: ident.type,
      },
    })
      .then(() => {
        setLastBroadcast(Date.now());
        setBroadcastCount((n) => n + 1);
      })
      .catch(() => {
        // broadcast failure is non-fatal — heartbeat will retry
      });
  }

  async function startDuty() {
    if (!isConfigured) {
      setError('Supabase not configured — copy .env.example to .env and fill in keys, then restart.');
      return;
    }
    const name = nameInput.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter your name so dispatch knows who is responding.');
      return;
    }
    setError(null);

    // Reuse existing id if the user is keeping the same identity, so they
    // appear as the same dot on the dashboard across sessions.
    const ident: Identity =
      identity && identity.name === name && identity.type === typeInput
        ? identity
        : { id: identity?.id ?? makeId(), name, type: typeInput };
    setIdentity(ident);
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(ident));

    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setError('Location permission denied — dispatch needs your position to route you.');
      return;
    }

    // Subscribe the realtime channel. Send the first broadcast as soon as the
    // SUBSCRIBED callback fires AND we already have a location fix in hand.
    const channel = supabase.channel(CHANNEL_NAME);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && locationRef.current) {
        broadcast(locationRef.current.coords, ident);
      }
    });
    channelRef.current = channel;

    // Start watching GPS. Each significant update fires a broadcast.
    try {
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (pos) => {
          locationRef.current = pos;
          setLocation(pos);
          broadcast(pos.coords, ident);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start GPS watcher');
      return;
    }

    // Heartbeat: re-broadcast even if the responder is stationary so the
    // dashboard knows they're still on duty (and so the marker doesn't go stale).
    heartbeatRef.current = setInterval(() => {
      if (locationRef.current) broadcast(locationRef.current.coords, ident);
    }, HEARTBEAT_MS);

    setOnDuty(true);
  }

  function stopDuty() {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setOnDuty(false);
    setLocation(null);
    locationRef.current = null;
    setLastBroadcast(null);
    setBroadcastCount(0);
  }

  const typeColor = TYPE_COLORS[typeInput];
  const sinceLast = lastBroadcast ? Math.floor((Date.now() - lastBroadcast) / 1000) : null;
  const labelType = TYPE_LABELS[typeInput];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <View style={{ marginBottom: 4 }}>
          <Text
            style={{
              color: COLORS.textFaint,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: '700',
            }}
          >
            RoadSoS · Responder
          </Text>
          <Text style={{ color: COLORS.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 4 }}>
            {onDuty ? 'On duty' : 'Off duty'}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
            {onDuty
              ? `Streaming your position to the dispatch dashboard.`
              : `When you go on duty your live position appears on the responder map.`}
          </Text>
        </View>

        {/* ─── Error banner ────────────────────────────────────────────────── */}
        {error ? (
          <View
            style={{
              backgroundColor: `${COLORS.sosRed}1A`,
              borderColor: `${COLORS.sosRed}59`,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Text style={{ color: COLORS.sosRed, fontSize: 13, fontWeight: '600' }}>{error}</Text>
          </View>
        ) : null}

        {/* ─── Identity card ───────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderColor: COLORS.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            gap: 12,
            opacity: onDuty ? 0.55 : 1,
          }}
        >
          <Text
            style={{
              color: COLORS.textMuted,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Identity
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>NAME</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              editable={!onDuty}
              placeholder="e.g. Unit 7 — Ravi"
              placeholderTextColor={COLORS.textFaint}
              style={{
                height: 46,
                backgroundColor: COLORS.surface2,
                borderColor: COLORS.border,
                borderWidth: 1,
                borderRadius: 10,
                color: COLORS.textPrimary,
                fontSize: 15,
                paddingHorizontal: 14,
              }}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TYPE</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['ambulance', 'police', 'fire'] as ResponderType[]).map((t) => {
                const selected = typeInput === t;
                const c = TYPE_COLORS[t];
                return (
                  <Pressable
                    key={t}
                    onPress={() => !onDuty && setTypeInput(t)}
                    disabled={onDuty}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 42,
                      borderRadius: 10,
                      borderWidth: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? `${c}1A` : COLORS.surface2,
                      borderColor: selected ? `${c}66` : COLORS.border,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text style={{ color: selected ? c : COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>
                      {TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {identity ? (
            <Text style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: 'monospace' }}>
              ID {identity.id.slice(0, 8).toUpperCase()}
            </Text>
          ) : null}
        </View>

        {/* ─── Live status (while on duty) ─────────────────────────────────── */}
        {onDuty ? (
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderColor: `${typeColor}66`,
              borderWidth: 1,
              borderRadius: 12,
              padding: 16,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: typeColor }} />
              <Text
                style={{
                  color: COLORS.textMuted,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Live · {labelType}
              </Text>
            </View>

            {location ? (
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    color: COLORS.textPrimary,
                    fontSize: 22,
                    fontWeight: '800',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  Accuracy ±{Math.round(location.coords.accuracy ?? 0)} m
                </Text>
              </View>
            ) : (
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Acquiring GPS fix…</Text>
            )}

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 4,
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingTop: 10,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                {broadcastCount} broadcast{broadcastCount === 1 ? '' : 's'} sent
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                {sinceLast == null ? '—' : sinceLast < 2 ? 'just now' : `${sinceLast}s ago`}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ─── Big toggle ──────────────────────────────────────────────────── */}
        <Pressable
          onPress={onDuty ? stopDuty : startDuty}
          style={({ pressed }) => ({
            height: 60,
            borderRadius: 14,
            backgroundColor: onDuty ? COLORS.sosRed : COLORS.safeGreen,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            marginTop: 4,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 }}>
            {onDuty ? 'End shift' : 'Go on duty'}
          </Text>
        </Pressable>

        <Text style={{ color: COLORS.textFaint, fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 17 }}>
          Broadcasts your GPS to the dispatch dashboard every few seconds while on duty.{'\n'}
          Identity is saved on this device only.
        </Text>
      </ScrollView>
    </View>
  );
}
