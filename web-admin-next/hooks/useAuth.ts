"use client";
import { useState, useEffect } from "react";
import { getUser } from "@/lib/api";
import { initSocketIO, disconnectSocket } from "@/lib/socketClient";

/**
 * TAHAP 7 BUG #1: web-admin Socket.io realtime is restored.
 *
 * History:
 *   - Pre-Tahap 2: token in localStorage, passed to socket via auth.token.
 *   - Tahap 2 P0-17: token moved to httpOnly cookie (good for XSS) — but
 *     this broke the web-admin's Socket.io because JS can no longer read
 *     the token to hand to the auth handshake.
 *   - Tahap 7 Bug #1: socketClient.ts now opens the socket with
 *     `withCredentials: true`, and backend/src/realtime/socketio.js reads
 *     `ptsss_token` out of the handshake's cookie header. No more token
 *     in JS, but the realtime channel works.
 *
 * REST API endpoints continue to work via `credentials: 'include'` in
 * apiFetch() for the same reason.
 */
export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (u) {
      setUser(u);
      // No token argument — the cookie carries auth.
      initSocketIO();
    }
    setLoading(false);
    return () => disconnectSocket();
  }, []);

  return { user, loading };
}