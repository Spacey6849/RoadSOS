import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

export interface Responder {
  responderId: string;
  name: string;
  lat: number;
  lng: number;
  responderType: string;
  timestamp: number;
}

export interface SOSSession {
  incidentId: string;
  lat: number;
  lng: number;
  userId?: string;
  timestamp: number;
}

interface UseResponderTrackingOptions {
  serverUrl?: string;
  autoConnect?: boolean;
  location?: { lat: number; lng: number };
}

export function useResponderTracking(options: UseResponderTrackingOptions = {}) {
  const { serverUrl = process.env.EXPO_PUBLIC_RESPONDER_URL || 'ws://localhost:8080', autoConnect = false, location } = options;
  const [responders, setResponders] = useState<Responder[]>([]);
  const [activeSOS, setActiveSOS] = useState<SOSSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [responderId, setResponderId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);

  const connect = useCallback(() => {
    disposedRef.current = false;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptRef.current = 0;
        // Register as a monitoring client
        ws.send(JSON.stringify({
          type: 'register-responder',
          name: 'RoadSoS Mobile',
          lat: location?.lat ?? 0,
          lng: location?.lng ?? 0,
          responderType: 'monitor',
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'welcome':
              setResponderId(msg.responderId);
              break;
            case 'responder-location':
              setResponders((prev) => {
                const next: Responder = {
                  responderId: msg.responderId,
                  name: msg.name,
                  lat: msg.lat,
                  lng: msg.lng,
                  responderType: msg.responderType ?? 'unknown',
                  timestamp: msg.timestamp ?? Date.now(),
                };
                const existing = prev.findIndex((r) => r.responderId === next.responderId);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = next;
                  return updated;
                }
                return [...prev, next];
              });
              break;
            case 'sos-active':
              setActiveSOS({
                incidentId: msg.incidentId,
                lat: msg.lat,
                lng: msg.lng,
                userId: msg.userId,
                timestamp: msg.timestamp,
              });
              break;
            case 'sos-resolved':
              setActiveSOS(null);
              break;
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (disposedRef.current) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!disposedRef.current) connect();
        }, delay);
      };

      ws.onerror = (e) => {
        if (__DEV__) console.error('[useResponderTracking] WebSocket error:', e);
      };
    } catch (err) {
      // WebSocket creation might throw synchronously e.g. for security policies on release builds
      if (__DEV__) console.warn("WebSocket creation failed", err);
    }
  }, [serverUrl]);

  const disconnect = useCallback(() => {
    disposedRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setResponders([]);
    setActiveSOS(null);
  }, []);

  const sendLocation = useCallback((lat: number, lng: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'update-location', lat, lng }));
    }
  }, []);

  const triggerSOSAlert = useCallback((incidentId: string, lat: number, lng: number, userId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'sos-triggered',
        incidentId, lat, lng, userId,
        contacts: [],
        timestamp: Date.now(),
      }));
    }
  }, []);

  const resolveSOS = useCallback((incidentId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'sos-resolved', incidentId }));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => { disconnect(); };
  }, [autoConnect, connect, disconnect]);

  return {
    responders,
    activeSOS,
    connected,
    responderId,
    connect,
    disconnect,
    sendLocation,
    triggerSOSAlert,
    resolveSOS,
  };
}
