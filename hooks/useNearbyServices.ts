import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchNearbyPOIs } from '../lib/overpass';
import {
  saveServicesCache,
  loadServicesCache,
  computeDistances,
  getSeedForRegion,
} from '../lib/offline-cache';
import { detectRegion, RegionInfo } from '../lib/region-detector';
import { NearbyService, ServiceType } from '../types';

interface UseNearbyServicesResult {
  services: NearbyService[];
  isOffline: boolean;
  isLoading: boolean;
  cacheAge: number | null;
  region: RegionInfo | null;
  dataSource: 'supabase' | 'overpass' | 'cache' | 'seed';
  refresh: () => void;
}

export function useNearbyServices(
  lat: number | null,
  lng: number | null,
  serviceType?: ServiceType
): UseNearbyServicesResult {
  const [services, setServices] = useState<NearbyService[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [region, setRegion] = useState<RegionInfo | null>(null);
  const [dataSource, setDataSource] = useState<UseNearbyServicesResult['dataSource']>('seed');
  const sequenceRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When a debounced call is superseded, resolve its promise immediately so
  // callers that `await refresh()` don't hang forever on the stale one.
  const pendingResolveRef = useRef<(() => void) | null>(null);

  const fetchServices = useCallback(async () => {
    if (lat == null || lng == null) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // Resolve the previous pending promise (superseded) before arming a new one.
    if (pendingResolveRef.current) {
      pendingResolveRef.current();
      pendingResolveRef.current = null;
    }

    return new Promise<void>((resolve) => {
      pendingResolveRef.current = resolve;
      debounceTimerRef.current = setTimeout(async () => {
        const detectedRegion = detectRegion(lat, lng);
        setRegion(detectedRegion);
        setIsLoading(true);

        const seq = ++sequenceRef.current;

    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.rpc('nearby_services', {
          lat,
          lng,
          radius_km: 25,
          p_service_type: serviceType ?? null,
          p_country_code: 'IN',
        });

        if (error) {
          throw new Error(error.message);
        }

        if (seq !== sequenceRef.current) return;

        const results = (data as NearbyService[]) || [];
        setServices(results);
        setIsOffline(false);
        setCacheAge(null);
        setDataSource('supabase');
        if (results.length > 0) {
          await saveServicesCache(results, detectedRegion.key);
        }
        return;
      }

      const overpassData = await fetchNearbyPOIs(lat, lng, 10);
      if (seq !== sequenceRef.current) return;

      if (overpassData.length > 0) {
        const filtered = serviceType
          ? overpassData.filter((s) => s.service_type === serviceType)
          : overpassData;
        setServices(filtered);
        setIsOffline(false);
        setCacheAge(null);
        setDataSource('overpass');
        await saveServicesCache(filtered, detectedRegion.key);
        return;
      }

      throw new Error('No POI data from Overpass');
    } catch (err) {
      if (seq !== sequenceRef.current) return;
      if (__DEV__) console.error('[useNearbyServices] Fetch failed:', err);
      const cached = await loadServicesCache(detectedRegion.key);
      if (cached && cached.services.length > 0 && !cached.isExpired) {
        const withDist = computeDistances(cached.services, lat, lng);
        const filtered = serviceType
          ? withDist.filter((s) => s.service_type === serviceType)
          : withDist;
        setServices(filtered);
        setCacheAge(cached.cacheAge);
        setDataSource('cache');
      } else {
        const seedData = getSeedForRegion(detectedRegion.key);
        const withDist = computeDistances(seedData, lat, lng);
        const filtered = serviceType
          ? withDist.filter((s) => s.service_type === serviceType)
          : withDist;
        setServices(filtered);
        setCacheAge(null);
        setDataSource('seed');
        if (filtered.length > 0) {
          await saveServicesCache(filtered, detectedRegion.key);
        }
      }
      setIsOffline(true);
    } finally {
      if (seq === sequenceRef.current) {
        setIsLoading(false);
      }
      // Only resolve if this timer is still the active one (otherwise the
      // supersession above already resolved it).
      if (pendingResolveRef.current === resolve) {
        pendingResolveRef.current = null;
      }
      resolve();
    }
      }, 450);
    });
  }, [lat, lng, serviceType]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return { services, isOffline, isLoading, cacheAge, region, dataSource, refresh: fetchServices };
}
