"use client";
import { useState, useEffect } from "react";
import { getToken, getUser } from "@/lib/api";
import { initSocketIO, disconnectSocket } from "@/lib/socketClient";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const u = getUser();
    if (token && u) {
      setUser(u);
      initSocketIO(token);
    }
    setLoading(false);
    return () => disconnectSocket();
  }, []);

  return { user, loading };
}
