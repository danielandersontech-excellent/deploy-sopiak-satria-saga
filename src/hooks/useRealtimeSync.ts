/**
 * REALTIME SYNC - Socket.io Client (replaces 60s polling)
 * Connects to backend Socket.io server for instant push updates.
 * Falls back to polling if Socket.io connection fails.
 *
 * TAHAP 8 BUG #4 (P2-13):
 *   Previous config let Socket.io retry forever (default Infinity), so a
 *   stretch of bad signal or a backend outage would have the phone
 *   hammering the network in the background — measurable battery drain.
 *   Now we cap retries, back off to 30s, and explicitly tie the socket
 *   lifecycle to AppState: connect when the app comes to foreground,
 *   disconnect when it goes to background. After all retries are
 *   exhausted, we stop trying until the next foreground event — so a
 *   minute-long subway outage doesn't lead to an hour of background
 *   reconnect attempts.
 *
 *   Auth: we still pass the token via `auth: { token }`. The web admin
 *   uses cookie auth (Tahap 7 Bug #1) but mobile is SecureStore-based,
 *   so the explicit token is the right channel here. The backend's
 *   handshake middleware (socketio.js) accepts both.
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { API_URL, getToken } from '../lib/apiClient';

let socket: any = null;
let socketConnected = false;

async function getSocketClient() {
  try { return require('socket.io-client'); }
  catch { return null; }
}

export function useRealtimeSync() {
  const loadAllData = useDataStore((s) => s.loadAllData);
  const user = useAuthStore((s) => s.user);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Track whether the inner Socket.io setup actually completed; we
  // shouldn't try to reconnect from AppState changes before then.
  const setupCompleteRef = useRef(false);

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    const prev = appStateRef.current;
    appStateRef.current = nextState;

    if (!setupCompleteRef.current) return;

    if (prev.match(/inactive|background/) && nextState === 'active') {
      // App returns to foreground: refresh data, and if the socket has
      // dropped (including post-`reconnect_failed`), reconnect now.
      // This is what makes the "give up after 10 tries" policy safe —
      // we always recover on next foreground.
      loadAllData();
      if (socket && !socket.connected) {
        try { socket.connect(); } catch { /* socket may be torn down */ }
      }
    } else if (nextState.match(/inactive|background/)) {
      // App goes to background: drop the WebSocket. Saves battery and
      // tells the backend to flush our presence sooner. Re-connect
      // happens on next foreground (above).
      if (socket && socket.connected) {
        try { socket.disconnect(); } catch { /* ignore */ }
      }
    }
  }, [loadAllData]);

  useEffect(() => {
    if (!user) return;
    let cleanup = () => {};

    (async () => {
      const token = await getToken();
      const io = await getSocketClient();

      if (io) {
        try {
          socket = io(API_URL, {
            // Mobile uses Authorization-style token; the backend
            // handshake middleware looks at cookie first, then this.
            auth: { token },
            transports: ['websocket', 'polling'],
            // BUG #4: bounded retry policy.
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
            // BUG #4: don't auto-connect on creation; we call
            // socket.connect() ourselves below so AppState handling can
            // own the connection lifecycle cleanly.
            autoConnect: false,
          });

          socket.on('connect', () => {
            socketConnected = true;
            if (user.lokasi_id) socket.emit('join:lokasi', user.lokasi_id);
          });
          socket.on('disconnect', () => { socketConnected = false; });
          // BUG #4: stop the retry loop after the configured max attempts.
          // The handler is informational — Socket.io has already given up
          // by the time it fires. The next AppState transition to
          // 'active' is what triggers a fresh connect attempt.
          socket.on('reconnect_failed', () => {
            // Avoid console.error to keep this quiet in production logs.
            console.warn('[Socket] Reconnection failed after max attempts. Will retry on next app foreground.');
            socketConnected = false;
          });

          const events = [
            'absensi:new', 'patroli:update', 'laporan:new', 'laporan:validated',
            'laporan:urgent', 'panic:alert', 'panic:resolved', 'broadcast:new',
            'user:status', 'stats:update',
          ];
          events.forEach((ev) => socket.on(ev, () => loadAllData()));

          // Polling fallback for when the socket is asleep — fires every
          // 5 minutes only if the socket isn't currently connected.
          intervalRef.current = setInterval(() => {
            if (!socketConnected) loadAllData();
          }, 300000);

          // Start the first connection now that all listeners are wired.
          setupCompleteRef.current = true;
          try { socket.connect(); } catch { /* ignore */ }

          cleanup = () => {
            setupCompleteRef.current = false;
            try { socket?.disconnect(); } catch { /* ignore */ }
            socket = null;
            socketConnected = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
          };
        } catch {
          // Socket library available but instantiation threw — fall back
          // to plain polling.
          intervalRef.current = setInterval(loadAllData, 60000);
          cleanup = () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
          };
        }
      } else {
        // No socket.io-client available — pure polling.
        intervalRef.current = setInterval(loadAllData, 60000);
        cleanup = () => {
          if (intervalRef.current) clearInterval(intervalRef.current);
        };
      }
    })();

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => { cleanup(); sub.remove(); };
  }, [user?.id]);
}

export function emitLocationPing(lat: number, lng: number) {
  if (socket && socketConnected) socket.emit('location:ping', { latitude: lat, longitude: lng });
}
export function isRealtimeConnected(): boolean { return socketConnected; }
export default useRealtimeSync;
