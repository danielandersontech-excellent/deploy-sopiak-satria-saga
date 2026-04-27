/**
 * Web Admin - Socket.io Realtime Client (Next.js)
 * Zero console.log in production
 */
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

let socket: Socket | null = null;
let connected = false;
let listeners: Array<(event: string, data: any) => void> = [];

const REALTIME_EVENTS = [
  'absensi:new',
  'patroli:update',
  'laporan:new',
  'laporan:validated',
  'laporan:urgent',
  'panic:alert',
  'panic:resolved',
  'broadcast:new',
  'user:status',
  'stats:update',
  'user:location',
  'geofence:violation',
  'geofence:izin',
];

export function initSocketIO(token?: string) {
  if (socket?.connected) return;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  try {
    socket = io(API_URL, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      connected = true;
      notifyListeners('connected', { id: socket?.id });
    });

    socket.on('disconnect', (reason: string) => {
      connected = false;
      notifyListeners('disconnected', { reason });
    });

    socket.on('connect_error', () => {
      // Silent - reconnect handled by socket.io
    });

    REALTIME_EVENTS.forEach(ev => {
      socket!.on(ev, (data: any) => {
        notifyListeners(ev, data);
      });
    });
  } catch {
    // Socket init failed silently
  }
}

function notifyListeners(event: string, data: any) {
  listeners.forEach(fn => {
    try { fn(event, data); } catch { /* silenced */ }
  });
}

export function onRealtimeEvent(fn: (event: string, data: any) => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export function isConnected(): boolean {
  return connected && !!socket?.connected;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    connected = false;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
