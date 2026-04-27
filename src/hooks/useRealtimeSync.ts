/**
 * REALTIME SYNC - Socket.io Client (replaces 60s polling)
 * Connects to backend Socket.io server for instant push updates.
 * Falls back to polling if Socket.io connection fails.
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
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
  const appStateRef = useRef(AppState.currentState);

  const handleAppStateChange = useCallback((nextState: any) => {
    if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
      loadAllData();
      if (socket && !socket.connected) socket.connect();
    }
    appStateRef.current = nextState;
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
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 3000, timeout: 10000,
          });
          socket.on('connect', () => { socketConnected = true; if (user.lokasi_id) socket.emit('join:lokasi', user.lokasi_id); });
          socket.on('disconnect', () => { socketConnected = false; });

          const events = ['absensi:new','patroli:update','laporan:new','laporan:validated','laporan:urgent','panic:alert','panic:resolved','broadcast:new','user:status','stats:update'];
          events.forEach(ev => socket.on(ev, () => loadAllData()));

          intervalRef.current = setInterval(() => { if (!socketConnected) loadAllData(); }, 300000);
          cleanup = () => { socket?.disconnect(); socket = null; socketConnected = false; if (intervalRef.current) clearInterval(intervalRef.current); };
        } catch {
          intervalRef.current = setInterval(loadAllData, 60000);
          cleanup = () => { if (intervalRef.current) clearInterval(intervalRef.current); };
        }
      } else {
        intervalRef.current = setInterval(loadAllData, 60000);
        cleanup = () => { if (intervalRef.current) clearInterval(intervalRef.current); };
      }
    })();

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => { cleanup(); sub.remove(); };
  }, [user?.id]);
}

export function emitLocationPing(lat: number, lng: number) { if (socket && socketConnected) socket.emit('location:ping', { latitude: lat, longitude: lng }); }
export function isRealtimeConnected(): boolean { return socketConnected; }
export default useRealtimeSync;
