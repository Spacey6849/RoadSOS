import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { LocationData } from '../types';

export function useLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastGeocodeRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) setError('Location permission denied');
          return;
        }
        // Best-effort background permission — Android requires a SEPARATE
        // prompt after foreground is granted (the system shows a second
        // settings page on Android 11+, can't be requested back-to-back).
        // Without this, the native crash service can only use the last
        // location that JS wrote to SharedPreferences before the app was
        // backgrounded. Silently continue on denial — foreground-only is a
        // valid fallback and crash detection still works.
        try { await Location.requestBackgroundPermissionsAsync(); } catch { /* user-denial is fine */ }

        // Get initial position fast
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted) {
          const loc = await enrichLocation(pos.coords.latitude, pos.coords.longitude);
          setLocation(loc);
        }

        // Watch for updates
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
          async (pos) => {
            if (!mounted) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const now = Date.now();
            const last = lastGeocodeRef.current;
            const shouldGeocode = !last || now - last.time > 60000 || Math.abs(lat - last.lat) > 0.005 || Math.abs(lng - last.lng) > 0.005;

            if (shouldGeocode) {
              try {
                const loc = await enrichLocation(lat, lng);
                // Re-check mounted after the await — the screen may have
                // unmounted while reverseGeocodeAsync was in flight.
                if (!mounted) return;
                lastGeocodeRef.current = { lat, lng, time: now };
                setLocation(loc);
              } catch (err) {
                if (!mounted) return;
                if (__DEV__) console.error('[useLocation] enrichLocation failed:', err);
                setLocation({ lat, lng, timestamp: Date.now() });
              }
            } else {
              setLocation({ lat, lng, timestamp: Date.now() });
            }
          }
        );
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Location error');
        }
      }
    })();

    return () => {
      mounted = false;
      watchRef.current?.remove();
    };
  }, []);

  async function refresh() {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const loc = await enrichLocation(pos.coords.latitude, pos.coords.longitude);
      setLocation(loc);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Location refresh failed');
    }
  }

  return { location, error, refresh };
}

async function enrichLocation(lat: number, lng: number): Promise<LocationData> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results[0];
    const address = [r?.name, r?.street, r?.district, r?.city, r?.region]
      .filter(Boolean)
      .join(', ');
    return { lat, lng, address, timestamp: Date.now() };
  } catch {
    return { lat, lng, timestamp: Date.now() };
  }
}
