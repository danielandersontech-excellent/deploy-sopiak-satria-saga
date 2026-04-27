"use client";
import { useEffect, useRef, useCallback } from "react";
import { clearAuth, apiFetch } from "@/lib/api";

export function useIdleTimeout(timeoutMs = 30 * 60 * 1000) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      // Call logout API to clear httpOnly cookies
      try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
      clearAuth();
      if (typeof window !== "undefined") window.location.href = "/login";
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);
}
