/**
 * Web Admin - Socket.io Realtime Client (Next.js)
 * Zero console.log in production.
 *
 * TAHAP 7 BUG #1 HOTFIX:
 *   The auth token lives in an httpOnly cookie (Tahap 2 P0-17) and is
 *   therefore unreadable from JS. Instead of trying to pass it through
 *   `auth.token`, the client now sends credentials with the WebSocket
 *   handshake via `withCredentials: true`. The backend's io.use() reads
 *   the cookie from the handshake headers (socketio.js). Web-admin
 *   realtime works again without exposing the token to JS.
 *
 *   The URL must be absolute (`https://api.sopiaksatriasaga.com` in
 *   prod) for the browser to send the cross-site cookie correctly — a
 *   relative URL falls back to the web-admin's own origin, where the
 *   Socket.io server isn't listening.
 */
import { io, Socket } from 'socket.io-client';

// Resolve socket URL once at module load. Prefer the explicit env var,
// fall back to the API URL, then to the page origin (dev-only).
function resolveSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

const SOCKET_URL = resolveSocketUrl();

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

/**
 * Initialize the socket. The optional `token` parameter is kept for the
 * mobile-app code path that still hands the token explicitly; web-admin
 * just calls `initSocketIO()` with no arguments and the cookie carries
 * the credentials.
 */
export function initSocketIO(token?: string) {
  if (socket?.connected) return;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  try {
    socket = io(SOCKET_URL, {
      // BUG #1: send the httpOnly auth cookie alongside the WebSocket
      // handshake. The backend reads it from `socket.handshake.headers.cookie`.
      withCredentials: true,
      // If a caller did pass an explicit token (mobile), keep using it as
      // a fallback. Web-admin will pass undefined and rely on the cookie.
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