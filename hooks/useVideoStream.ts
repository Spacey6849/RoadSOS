import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from 'react-native-webrtc';

const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL || 'ws://localhost:8081';

export interface StreamState {
  isStreaming: boolean;
  hasCamera: boolean;
  hasMicrophone: boolean;
  peerConnected: boolean;
  error: string | null;
  isMuted: boolean;
}

const PC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useVideoStream(roomId: string | null) {
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    hasCamera: false,
    hasMicrophone: false,
    peerConnected: false,
    error: null,
    isMuted: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const roomIdRef = useRef<string | null>(roomId);
  roomIdRef.current = roomId;

  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const camera = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        const audio = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        setState(prev => ({
          ...prev,
          hasCamera: camera === PermissionsAndroid.RESULTS.GRANTED,
          hasMicrophone: audio === PermissionsAndroid.RESULTS.GRANTED,
        }));
        return camera === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        if (__DEV__) console.error('[useVideoStream] Permission request failed:', err);
        setState(prev => ({ ...prev, error: 'Permission request failed' }));
        return false;
      }
    }
    // iOS: react-native-webrtc handles permissions internally via mediaDevices.getUserMedia
    setState(prev => ({ ...prev, hasCamera: true, hasMicrophone: true }));
    return true;
  }, []);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN && roomIdRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'leave-room', roomId: roomIdRef.current }));
        }
      } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;

    cleanup();

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setState(prev => ({ ...prev, error: 'Camera permission denied' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isStreaming: true, error: null }));

      const stream = await mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;

      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'join-room', roomId: currentRoomId }));
        }
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'room-joined': {
              const pc = new RTCPeerConnection(PC_CONFIG);
              peerConnectionRef.current = pc;

              if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => {
                  pc.addTrack(track);
                });
              }

              pc.onicecandidate = (e) => {
                if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: e.candidate,
                  }));
                }
              };

              pc.ontrack = () => {
                setState(prev => ({ ...prev, peerConnected: true }));
              };

              pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') {
                  setState(prev => ({ ...prev, peerConnected: true }));
                } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                  setState(prev => ({ ...prev, peerConnected: false }));
                }
              };

              if (msg.peerCount === 1) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
                }
              }
              break;
            }

            case 'peer-joined': {
              const pc2 = peerConnectionRef.current;
              if (pc2) {
                const offer = await pc2.createOffer();
                await pc2.setLocalDescription(offer);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
                }
              }
              break;
            }

            case 'offer':
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(
                  new RTCSessionDescription(msg.sdp)
                );
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'answer', sdp: answer }));
                }
              }
              break;

            case 'answer':
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(
                  new RTCSessionDescription(msg.sdp)
                );
              }
              break;

            case 'ice-candidate':
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(msg.candidate)
                );
              }
              break;
          }
        } catch (err) {
          if (__DEV__) console.error('[useVideoStream] Message parse error:', err);
        }
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, peerConnected: false }));
      };

      ws.onerror = (e) => {
        if (__DEV__) console.error('[useVideoStream] WebSocket error:', e);
        setState(prev => ({ ...prev, error: 'Connection error' }));
      };

    } catch (err) {
      if (__DEV__) console.error('[useVideoStream] startStream failed:', err);
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error', isStreaming: false }));
    }
  }, [requestPermissions, cleanup]);

  const stopStream = useCallback(() => {
    cleanup();
    setState(prev => ({
      isStreaming: false,
      hasCamera: prev.hasCamera,
      hasMicrophone: prev.hasMicrophone,
      peerConnected: false,
      error: null,
      isMuted: false,
    }));
  }, [cleanup]);

  /**
   * Toggle the local microphone audio track.
   * Returns the new muted state.
   */
  const toggleMute = useCallback((): boolean => {
    const stream = localStreamRef.current;
    if (!stream) return false;
    let nextMuted = false;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
      // After flipping, track.enabled is the live state.
      // muted = NOT enabled.
      nextMuted = !track.enabled;
    });
    setState(prev => ({ ...prev, isMuted: nextMuted }));
    return nextMuted;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...state,
    startStream,
    stopStream,
    toggleMute,
  };
}
