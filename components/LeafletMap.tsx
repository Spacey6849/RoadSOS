import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Typography, Spacing } from '../constants/theme';
import { LEAFLET_CSS, LEAFLET_JS } from './leaflet-inline';
import { getCachedTileDataUri } from '../lib/tile-cache';

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: string;
}

interface LeafletMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MarkerData[];
  focusedMarker?: string | null;
  onError?: () => void;
}

/**
 * The Leaflet runtime is bundled into the JS string below at build time
 * (see scripts/inline-leaflet.js). The HTML never makes a network request
 * for the library itself, only for the OSM raster tiles — and even those
 * fail-safe to a flat dark canvas if the device is offline.
 */
const buildHtml = (initialCenter: { lat: number; lng: number }, initialZoom: number) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>${LEAFLET_CSS}</style>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; width: 100%; background: #07090D; }
  #map { height: 100vh; width: 100vw; background: #1C2128; }
  .leaflet-container { background: #1C2128 !important; outline: none; }
  .marker-label {
    background: transparent;
    border: none;
    font-weight: 700;
    font-size: 11px;
    color: #fff;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.7);
    transform: translateY(-22px);
    white-space: nowrap;
  }
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function () {
  function safePost(payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (e) { /* swallow */ }
  }

  // Top-level error trap so a runtime exception never blanks the WebView.
  window.addEventListener('error', function (event) {
    safePost({ type: 'error', message: String(event && event.message) });
  });

  if (typeof L === 'undefined') {
    safePost({ type: 'error', message: 'leaflet runtime missing' });
    return;
  }

  var map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView([${initialCenter.lat}, ${initialCenter.lng}], ${initialZoom});

  // Offline-aware tile layer. Each tile is requested from the native side via
  // postMessage; native replies with a cached base64 PNG (works offline) or
  // null, in which case we fall back to the live OSM URL. A timeout also falls
  // back to network so a missed reply never leaves a permanent blank tile.
  var pendingTiles = {};
  var reqSeq = 0;
  function tileFallbackUrl(z, x, y) {
    return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
  }

  var OfflineTileLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
      var img = document.createElement('img');
      img.setAttribute('role', 'presentation');
      img.alt = '';
      var z = coords.z, x = coords.x, y = coords.y;
      var reqId = 'q' + (reqSeq++);
      var settled = false;
      function settle(src) {
        if (settled) return;
        settled = true;
        delete pendingTiles[reqId];
        img.onload = function () { done(null, img); };
        // A blank tile must not error the whole map — just resolve empty.
        img.onerror = function () { done(null, img); };
        img.src = src;
      }
      pendingTiles[reqId] = function (data) { settle(data || tileFallbackUrl(z, x, y)); };
      setTimeout(function () { settle(tileFallbackUrl(z, x, y)); }, 6000);
      safePost({ type: 'tileRequest', reqId: reqId, z: z, x: x, y: y });
      return img;
    }
  });

  new OfflineTileLayer({ maxZoom: 19, tileSize: 256 }).addTo(map);

  var markers = {};
  var focusedId = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function addMarker(id, lat, lng, label, color) {
    try {
      var isFocused = id === focusedId;
      var size = isFocused ? 22 : 14;
      var border = isFocused ? 3 : 2;
      var glow = isFocused
        ? '0 0 12px ' + (color || '#FF3B3B')
        : '0 1px 3px rgba(0,0,0,0.4)';
      var safeLabel = escapeHtml(label);
      var icon = L.divIcon({
        html:
          '<div style="background:' + (color || '#FF3B3B') +
          ';width:' + size + 'px;height:' + size +
          'px;border-radius:50%;border:' + border +
          'px solid #fff;box-shadow:' + glow + ';"></div>' +
          '<div class="marker-label">' + safeLabel + '</div>',
        className: '',
        iconSize: [size, size + 20],
        iconAnchor: [size / 2, size / 2],
      });
      var marker = L.marker([lat, lng], { icon: icon }).addTo(map);
      if (label) marker.bindPopup('<b>' + safeLabel + '</b>');
      markers[id] = marker;
    } catch (e) {
      safePost({ type: 'error', message: 'addMarker failed: ' + String(e) });
    }
  }

  function removeMarker(id) {
    if (markers[id]) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  }

  function setCenter(lat, lng, zoom) {
    map.setView([lat, lng], zoom || 13, { animate: true, duration: 0.5 });
  }

  function clearMarkers() {
    for (var key in markers) {
      if (Object.prototype.hasOwnProperty.call(markers, key)) {
        map.removeLayer(markers[key]);
      }
    }
    markers = {};
  }

  function handleMessage(raw) {
    try {
      var msg = JSON.parse(raw);
      if (msg.type === 'setCenter') setCenter(msg.lat, msg.lng, msg.zoom || 13);
      else if (msg.type === 'addMarker') addMarker(msg.id, msg.lat, msg.lng, msg.label, msg.color);
      else if (msg.type === 'removeMarker') removeMarker(msg.id);
      else if (msg.type === 'clearMarkers') { clearMarkers(); focusedId = null; }
      else if (msg.type === 'focusMarker') { clearMarkers(); focusedId = msg.id; }
      else if (msg.type === 'tileData') {
        var cb = pendingTiles[msg.reqId];
        if (cb) cb(msg.data);
      }
    } catch (e) {
      safePost({ type: 'error', message: 'handleMessage failed: ' + String(e) });
    }
  }

  // Both Android and iOS WebViews dispatch postMessage payloads to either
  // window or document — listen on both to be safe.
  window.addEventListener('message', function (e) { handleMessage(e.data); });
  document.addEventListener('message', function (e) { handleMessage(e.data); });

  safePost({ type: 'ready' });
})();
</script>
</body>
</html>
`;

export function LeafletMap({ center, zoom = 13, markers = [], focusedMarker, onError }: LeafletMapProps) {
  const webRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const prevMarkersRef = useRef<Set<string>>(new Set());
  // The HTML is captured once with the initial center/zoom so re-renders
  // never reload the WebView from scratch — we steer the existing instance
  // via postMessage.
  const initialHtmlRef = useRef<string>(buildHtml(center, zoom));

  const postMsg = useCallback((msg: object) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // Watchdog: if the WebView never reports `ready` within 8 s, mark it as
  // errored so the parent can show a fallback instead of an infinite spinner.
  useEffect(() => {
    if (loaded || errored) return;
    const timer = setTimeout(() => {
      if (!loaded) {
        setErrored(true);
        onError?.();
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [errored, loaded, onError]);

  useEffect(() => {
    if (!loaded) return;
    if (focusedMarker) {
      const m = markers.find((x) => x.id === focusedMarker);
      if (m) {
        let timer2: ReturnType<typeof setTimeout>;
        const timer1 = setTimeout(() => {
          postMsg({ type: 'clearMarkers' });
          timer2 = setTimeout(() => {
            postMsg({ type: 'addMarker', id: m.id, lat: m.lat, lng: m.lng, label: m.label, color: m.color });
            postMsg({ type: 'setCenter', lat: m.lat, lng: m.lng, zoom: 16 });
          }, 50);
        }, 50);
        prevMarkersRef.current = new Set([m.id]);
        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      }
    }
    postMsg({ type: 'setCenter', lat: center.lat, lng: center.lng, zoom });
  }, [center.lat, center.lng, focusedMarker, loaded, markers, postMsg, zoom]);

  useEffect(() => {
    if (!loaded || focusedMarker) return;
    const prev = prevMarkersRef.current;
    const current = new Set(markers.map((m) => m.id));

    for (const id of prev) {
      if (!current.has(id)) postMsg({ type: 'removeMarker', id });
    }
    for (const m of markers) {
      if (!prev.has(m.id)) postMsg({ type: 'addMarker', id: m.id, lat: m.lat, lng: m.lng, label: m.label, color: m.color });
    }
    prevMarkersRef.current = current;
  }, [markers, loaded, focusedMarker, postMsg]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {!loaded && !errored ? (
        <View style={styles.spinner}>
          <ActivityIndicator color="#FF3B3B" size="large" />
        </View>
      ) : null}

      {errored ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Map unavailable offline</Text>
          <Text style={styles.errorBody}>
            RoadSoS will keep ranking nearby services by distance. Check your connection to load the map view.
          </Text>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ html: initialHtmlRef.current, baseUrl: 'https://localhost/' }}
          style={StyleSheet.absoluteFill}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === 'ready') setLoaded(true);
              else if (msg.type === 'tileRequest') {
                // Serve a cached tile if we have it; null tells the WebView to
                // fetch the tile live (online) instead.
                getCachedTileDataUri(msg.z, msg.x, msg.y)
                  .then((data) => postMsg({ type: 'tileData', reqId: msg.reqId, data }))
                  .catch(() => postMsg({ type: 'tileData', reqId: msg.reqId, data: null }));
              } else if (msg.type === 'error') {
                // Swallow non-fatal map errors — only mark errored if we never loaded.
                if (!loaded) {
                  setErrored(true);
                  onError?.();
                }
              }
            } catch {
              /* ignore malformed payloads */
            }
          }}
          onError={() => {
            setErrored(true);
            onError?.();
          }}
          onHttpError={() => {
            // Tile fetches can 404 occasionally — don't tear down the map for that.
          }}
          onRenderProcessGone={() => {
            setErrored(true);
            onError?.();
          }}
          javaScriptEnabled
          domStorageEnabled
          // Step A — let the WebView serve previously-fetched tiles from its
          // own HTTP cache when offline (covers areas the user panned to while
          // online, on top of the filesystem pre-cache below).
          cacheEnabled
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          originWhitelist={['*']}
          mixedContentMode="always"
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
  },
  errorTitle: {
    color: Colors.textPrimary,
    ...Typography.bodySmall,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorBody: {
    color: Colors.textMuted,
    ...Typography.caption,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
