"use client";
import { useState, useEffect } from "react";
import { getUser } from "@/lib/api";
import { initSocketIO, disconnectSocket } from "@/lib/socketClient";

/**
 * P0-17 follow-on (Tahap 2): the localStorage token storage was removed
 * in favor of httpOnly cookies. That means client-side JS can no longer
 * read the auth token to pass into Socket.io's handshake `auth.token`.
 *
 * For now we initialize the socket without a token. The backend's
 * io.use() middleware (P0-10) will reject the handshake — realtime
 * features in the web admin will be temporarily unavailable until a
 * proper cookie-based socket auth flow is implemented (e.g. a
 * short-lived `/api/auth/socket-token` endpoint, or backend reading
 * the cookie from `socket.handshake.headers.cookie`).
 *
 * REST API endpoints continue to work normally — they use the
 * httpOnly cookie via `credentials: 'include'` in apiFetch().
 */
export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (u) {
      setUser(u);
      initSocketIO();
    }
    setLoading(false);
    return () => disconnectSocket();
  }, []);

  return { user, loading };
}
