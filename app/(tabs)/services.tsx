import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, MapPin, RefreshCw, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, EmptyState, GhostButton, StatusPill } from '../../components/AppKit';
import { LeafletMap } from '../../components/LeafletMap';
import { ServiceCard } from '../../components/ServiceCard';
import { Colors, Radius, ServiceTypeColors, Spacing, Typography } from '../../constants/theme';
import { serviceVisual } from '../../constants/serviceVisuals';
import { TAB_BAR_TOTAL } from '../../constants/layout';
import { useLocation } from '../../hooks/useLocation';
import { useNearbyServices } from '../../hooks/useNearbyServices';
import { cacheRegion, getCacheInfo } from '../../lib/tile-cache';
import { ServiceType } from '../../types';

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
const SCREEN_HEIGHT = Dimensions.get('window').height;

const FILTERS: { label: string; value: ServiceType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Hospital', value: 'hospital' },
  { label: 'Trauma', value: 'trauma_centre' },
  { label: 'Ambulance', value: 'ambulance' },
  { label: 'Police', value: 'police' },
  { label: 'Fire', value: 'fire_station' },
  { label: 'Towing', value: 'towing' },
  { label: 'Tyre', value: 'puncture' },
];

export default function ServicesScreen() {
  const insets = useSafeAreaInsets();
  const { location, refresh: refreshLocation } = useLocation();
  const [filter, setFilter] = useState<ServiceType | 'all'>('all');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [mapCacheStatus, setMapCacheStatus] = useState<'idle' | 'caching' | 'ready'>('idle');
  const [cachePct, setCachePct] = useState(0);
  const cachedKeyRef = useRef<string | null>(null);
  const { services, isOffline, isLoading, cacheAge, region, dataSource, refresh } = useNearbyServices(
    location?.lat ?? null,
    location?.lng ?? null,
    filter === 'all' ? undefined : filter,
  );

  // Bottom sheet: collapsed shows ~peek, expanded covers most of the screen.
  const tabSpace = TAB_BAR_TOTAL + insets.bottom;
  const peekHeight = 180 + tabSpace;
  const expandedHeight = Math.min(SCREEN_HEIGHT * 0.72, SCREEN_HEIGHT - insets.top - 40);
  const [expanded, setExpanded] = useState(false);
  const heightAnim = useRef(new Animated.Value(peekHeight)).current;

  const animateTo = (target: number) => {
    Animated.spring(heightAnim, {
      toValue: target,
      useNativeDriver: false,
      damping: 22,
      stiffness: 200,
    }).start();
  };

  const toggleExpanded = (next?: boolean) => {
    const willExpand = next ?? !expanded;
    setExpanded(willExpand);
    animateTo(willExpand ? expandedHeight : peekHeight);
  };

  // Drag handle for the sheet.
  const dragStartHeight = useRef(peekHeight);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragStartHeight.current = (heightAnim as unknown as { _value: number })._value ?? peekHeight;
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(peekHeight, Math.min(expandedHeight, dragStartHeight.current - gesture.dy));
        heightAnim.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const finalHeight = dragStartHeight.current - gesture.dy;
        const midpoint = (peekHeight + expandedHeight) / 2;
        toggleExpanded(finalHeight > midpoint);
      },
    }),
  ).current;

  const center = location ?? INDIA_CENTER;
  const markers = useMemo(
    () =>
      services.map((service) => ({
        id: service.id,
        lat: service.lat,
        lng: service.lng,
        label: `${service.name} (${service.distance_km.toFixed(1)} km)`,
        color: ServiceTypeColors[service.service_type] ?? Colors.infoBlue,
      })),
    [services],
  );

  // Reflect any tiles already on disk as "ready" on mount.
  useEffect(() => {
    getCacheInfo()
      .then((info) => { if (info.tiles > 0) setMapCacheStatus((s) => (s === 'idle' ? 'ready' : s)); })
      .catch(() => {});
  }, []);

  // Pre-download map tiles around the user while online so the map still
  // renders offline. Keyed to a ~1 km grid cell so it runs once per area, not
  // on every GPS tick, and only when we have a live connection.
  useEffect(() => {
    if (!location || isOffline) return;
    const key = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`;
    if (cachedKeyRef.current === key) return;
    cachedKeyRef.current = key;
    setMapCacheStatus('caching');
    setCachePct(0);
    cacheRegion(location.lat, location.lng, {}, (p) => {
      setCachePct(p.total ? Math.round((p.done / p.total) * 100) : 0);
    })
      .then((res) => { if (!res.skipped) setMapCacheStatus('ready'); })
      .catch(() => setMapCacheStatus((s) => (s === 'caching' ? 'idle' : s)));
  }, [location, isOffline]);

  async function refreshAll() {
    await refreshLocation();
    await Promise.resolve(refresh());
  }

  const mapCacheNote =
    mapCacheStatus === 'caching' ? `  ·  Saving offline map ${cachePct}%`
    : mapCacheStatus === 'ready' ? '  ·  Offline map ready'
    : '';

  const freshness = cacheAge ? `Cached ${Math.max(1, Math.round(cacheAge / 3600000))}h ago` : dataSource;

  return (
    <View style={styles.root}>
      {/* Full-screen map sits behind everything else. */}
      <View style={StyleSheet.absoluteFill}>
        <LeafletMap
          center={{ lat: center.lat, lng: center.lng }}
          zoom={location ? 13 : 5}
          markers={markers}
          focusedMarker={focusedId}
        />
      </View>

      {/* Top status bar — translucent to keep the map visible behind it. */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.topBarRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Nearby services</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {(region ? region.name : location ? 'Searching nearby' : 'Waiting for location') + mapCacheNote}
            </Text>
          </View>
          <StatusPill label={isOffline ? freshness : 'Live'} tone={isOffline ? 'amber' : 'green'} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.xs, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.lg }}
          style={{ marginHorizontal: -Spacing.lg, marginTop: Spacing.sm }}
        >
          {FILTERS.map((item) => {
            const vis = item.value === 'all' ? null : serviceVisual(item.value);
            return (
              <Chip
                key={item.value}
                label={item.label}
                Icon={vis?.Icon}
                selected={filter === item.value}
                onPress={() => {
                  setFilter(item.value);
                  setFocusedId(null);
                }}
                tone={vis ? vis.tone : 'red'}
              />
            );
          })}
        </ScrollView>
      </View>

      {/* "Recenter / Clear focus" floating action above the sheet. */}
      {focusedId ? (
        <Pressable
          onPress={() => setFocusedId(null)}
          style={[styles.recenter, { bottom: peekHeight + Spacing.md }]}
          accessibilityRole="button"
          accessibilityLabel="Show all services on the map"
        >
          <MapPin size={16} color={Colors.textPrimary} strokeWidth={2.5} />
          <Text style={styles.recenterLabel}>Show all</Text>
        </Pressable>
      ) : null}

      {/* Bottom overlay panel — drag-handle to expand. */}
      <Animated.View style={[styles.sheet, { height: heightAnim }]}>
        <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
          <View style={styles.dragHandle} />
        </View>

        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>
              {services.length} service{services.length === 1 ? '' : 's'} nearby
            </Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {location
                ? location.address ?? (region?.name ?? 'Location active')
                : 'Enable location to rank by distance'}
            </Text>
          </View>
          <Pressable
            onPress={() => toggleExpanded()}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse list' : 'Expand list'}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? Colors.surface3 : Colors.surface2,
            })}
          >
            {expanded
              ? <ChevronDown size={18} color={Colors.textMuted} strokeWidth={2.5} />
              : <ChevronUp size={18} color={Colors.textMuted} strokeWidth={2.5} />}
          </Pressable>
          <GhostButton
            label="Refresh"
            Icon={RefreshCw}
            tone="blue"
            onPress={refreshAll}
            style={{ marginLeft: Spacing.xs }}
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: tabSpace + Spacing.sm }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {services.length === 0 ? (
            <EmptyState
              Icon={location ? Search : MapPin}
              title={location ? (isLoading ? 'Searching nearby...' : 'No services found') : 'Waiting for GPS'}
              body={
                location
                  ? 'Try another filter or refresh nearby services.'
                  : 'Grant location permission so RoadSoS can find help nearby.'
              }
            />
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  expanded={focusedId === service.id}
                  onToggle={() => setFocusedId((current) => (current === service.id ? null : service.id))}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: 'rgba(7,9,13,0.78)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    ...Typography.h2,
  },
  subtitle: {
    color: Colors.textMuted,
    ...Typography.caption,
    marginTop: 2,
  },
  recenter: {
    position: 'absolute',
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(7,9,13,0.92)',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  recenterLabel: {
    color: Colors.textPrimary,
    ...Typography.caption,
    fontWeight: '700',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dragHandleArea: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 4,
    backgroundColor: Colors.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    color: Colors.textPrimary,
    ...Typography.bodySmall,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: Colors.textMuted,
    ...Typography.caption,
    marginTop: 2,
  },
});
